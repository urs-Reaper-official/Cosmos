import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from cosmos.provider import ProviderError
from cosmos.providers import LocalLlamaClient, LocalModelProvider, create_provider_registry


class ProviderRegistryTests(unittest.TestCase):
    def test_registry_exposes_only_the_in_process_local_model(self) -> None:
        registry = create_provider_registry({})

        self.assertEqual(registry.default_provider, "local")
        self.assertEqual([provider["id"] for provider in registry.list()], ["local"])
        with self.assertRaises(ValueError):
            registry.get("openrouter")

    def test_local_model_requires_runtime_and_existing_gguf_file(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            model_path = Path(directory) / "cosmos-model.gguf"
            model_path.touch()
            provider = LocalModelProvider(str(model_path))

            with patch("cosmos.providers.importlib.util.find_spec", return_value=None):
                self.assertFalse(provider.is_configured())
                with self.assertRaises(ProviderError):
                    provider.discover_models()

            with patch("cosmos.providers.importlib.util.find_spec", return_value=object()):
                self.assertTrue(provider.is_configured())
                self.assertEqual(provider.discover_models()[0].id, model_path.name)

    def test_context_size_is_bounded(self) -> None:
        with self.assertRaises(ValueError):
            create_provider_registry({"COSMOS_CONTEXT_SIZE": "256"})

    @patch("cosmos.providers._load_model")
    def test_local_client_passes_tools_and_returns_tool_calls(self, load_model) -> None:
        runtime = load_model.return_value
        runtime.create_chat_completion.return_value = {
            "choices": [
                {
                    "message": {
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call-1",
                                "function": {
                                    "name": "calculator",
                                    "arguments": '{"expression":"2 + 2"}',
                                },
                            }
                        ],
                    }
                }
            ]
        }
        client = LocalLlamaClient("/models/cosmos.gguf", 4096)
        tools = [{"type": "function", "function": {"name": "calculator"}}]

        result = client.complete([{"role": "user", "content": "Calculate 2+2"}], "cosmos", tools)

        self.assertEqual(result.tool_calls[0].name, "calculator")
        self.assertEqual(result.tool_calls[0].arguments, {"expression": "2 + 2"})
        self.assertEqual(runtime.create_chat_completion.call_args.kwargs["tools"], tools)
        self.assertEqual(runtime.create_chat_completion.call_args.kwargs["max_tokens"], 128)

    @patch("cosmos.providers._load_model")
    def test_local_client_removes_model_thinking_tags_from_reply(self, load_model) -> None:
        load_model.return_value.create_chat_completion.return_value = {
            "choices": [
                {
                    "message": {
                        "content": "<think>internal reasoning</think>\nCOSMOS is ready.",
                        "tool_calls": [],
                    }
                }
            ]
        }

        result = LocalLlamaClient("/models/cosmos.gguf", 4096).complete([], "cosmos")

        self.assertEqual(result.content, "COSMOS is ready.")


if __name__ == "__main__":
    unittest.main()
