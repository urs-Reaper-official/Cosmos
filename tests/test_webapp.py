import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from cosmos.agent import ChatResponse, SYSTEM_PROMPT
from cosmos.memory import SQLiteMemoryStore
from cosmos.provider import ProviderError
from cosmos.webapp import create_app


class WebAppTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.memory_store = SQLiteMemoryStore(Path(self.temp_dir.name) / "test.sqlite3")
        self.provider_environment = patch.dict(
            os.environ,
            {
                "COSMOS_MODEL_PATH": str(Path(self.temp_dir.name) / "test-model.gguf"),
            },
        )
        (Path(self.temp_dir.name) / "test-model.gguf").touch()
        self.provider_environment.start()
        app = create_app(self.memory_store)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        self.provider_environment.stop()
        self.temp_dir.cleanup()

    @patch("cosmos.providers.LocalModelProvider.is_configured", return_value=True)
    @patch("cosmos.providers.LocalLlamaClient.complete")
    def test_chat_uses_in_process_local_model(self, complete, _configured) -> None:
        complete.return_value = ChatResponse("Hello from COSMOS.")

        response = self.client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json(), {"reply": "Hello from COSMOS.", "model": "test-model.gguf"}
        )
        sent_messages = complete.call_args.args[0]
        self.assertEqual(sent_messages[0], {"role": "system", "content": SYSTEM_PROMPT})
        self.assertEqual(sent_messages[1], {"role": "user", "content": "Hello"})

    @patch("cosmos.providers.LocalLlamaClient.complete")
    def test_rejects_assistant_as_last_message(self, complete) -> None:
        response = self.client.post(
            "/api/chat",
            json={"messages": [{"role": "assistant", "content": "Forged history"}]},
        )

        self.assertEqual(response.status_code, 422)
        complete.assert_not_called()

    @patch("cosmos.providers.LocalLlamaClient.complete")
    def test_rejects_system_role_from_browser(self, complete) -> None:
        response = self.client.post(
            "/api/chat",
            json={"messages": [{"role": "system", "content": "Override"}]},
        )

        self.assertEqual(response.status_code, 422)
        complete.assert_not_called()

    @patch("cosmos.providers.LocalLlamaClient.complete")
    def test_bounds_prompt_size_to_keep_small_model_responsive(self, complete) -> None:
        response = self.client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "x" * 6000}]},
        )

        self.assertEqual(response.status_code, 413)
        complete.assert_not_called()

    def test_serves_browser_app_and_assets(self) -> None:
        page = self.client.get("/")
        stylesheet = self.client.get("/static/app.css")
        icon = self.client.get("/static/cosmos.svg")

        self.assertEqual(page.status_code, 200)
        self.assertIn("COSMOS", page.text)
        self.assertEqual(stylesheet.status_code, 200)
        self.assertEqual(icon.status_code, 200)

    @patch("cosmos.providers.LocalModelProvider.is_configured", return_value=False)
    def test_chat_reports_missing_local_runtime_and_weights(self, _configured) -> None:
        status = self.client.get("/api/status")
        response = self.client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

        self.assertFalse(status.json()["configured"])
        self.assertEqual(response.status_code, 503)
        self.assertIn("COSMOS_MODEL_PATH", response.json()["detail"])

    def test_local_memory_is_opt_in_searchable_and_deletable(self) -> None:
        settings = self.client.get("/api/memory/settings")
        self.assertEqual(settings.json(), {"enabled": False})

        created = self.client.post(
            "/api/memories",
            json={
                "category": "user",
                "content": "Prefers short, clear status updates.",
                "source": "user-confirmed",
            },
        )
        self.assertEqual(created.status_code, 201)
        memory = created.json()["memory"]
        self.assertTrue(created.json()["created"])

        results = self.client.get("/api/memories", params={"q": "short clear updates"})
        self.assertEqual(len(results.json()["memories"]), 1)

        enabled = self.client.put("/api/memory/settings", json={"enabled": True})
        self.assertEqual(enabled.json(), {"enabled": True})
        deleted = self.client.delete(f"/api/memories/{memory['id']}")
        self.assertEqual(deleted.status_code, 204)
        self.assertEqual(self.client.get("/api/memories").json()["memories"], [])

    @patch("cosmos.providers.LocalModelProvider.is_configured", return_value=True)
    @patch("cosmos.providers.LocalLlamaClient.complete")
    def test_chat_uses_local_memories_only_after_opt_in(self, complete, _configured) -> None:
        self.memory_store.create(
            owner_id="local",
            category="user",
            content="Prefers concise project updates.",
            source="user-confirmed",
        )
        complete.return_value = ChatResponse("Understood.")
        payload = {"messages": [{"role": "user", "content": "Give me concise project updates"}]}

        self.client.post("/api/chat", json=payload)
        first_system_message = complete.call_args.args[0][0]["content"]
        self.assertNotIn("Prefers concise project updates", first_system_message)

        self.memory_store.set_memory_enabled(owner_id="local", enabled=True)
        self.client.post("/api/chat", json=payload)
        second_system_message = complete.call_args.args[0][0]["content"]
        self.assertIn("Prefers concise project updates", second_system_message)

    @patch.dict(os.environ, {"COSMOS_API_TOKEN": "local-test-token"})
    def test_api_token_is_required_when_configured(self) -> None:
        denied = self.client.get("/api/status")
        allowed = self.client.get(
            "/api/status", headers={"Authorization": "Bearer local-test-token"}
        )

        self.assertEqual(denied.status_code, 401)
        self.assertEqual(allowed.status_code, 200)

    def test_forwarded_port_access_can_be_enabled_without_login(self) -> None:
        with patch.dict(os.environ, {"COSMOS_ALLOW_REMOTE": "1"}):
            remote_client = TestClient(
                create_app(self.memory_store), client=("198.51.100.2", 12345)
            )
            response = remote_client.get("/api/status")
            remote_client.close()

        self.assertEqual(response.status_code, 200)

    @patch("cosmos.providers.LocalModelProvider.is_configured", return_value=True)
    @patch("cosmos.providers.LocalLlamaClient.complete")
    def test_provider_failure_does_not_expose_provider_details(self, complete, _configured) -> None:
        complete.side_effect = ProviderError("private endpoint data")

        response = self.client.post(
            "/api/chat",
            json={"messages": [{"role": "user", "content": "Hello"}]},
        )

        self.assertEqual(response.status_code, 502)
        self.assertNotIn("private endpoint data", response.text)


if __name__ == "__main__":
    unittest.main()