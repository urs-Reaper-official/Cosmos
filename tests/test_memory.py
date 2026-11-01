import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cosmos.memory import SQLiteMemoryStore


class SQLiteMemoryStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SQLiteMemoryStore(Path(self.temp_dir.name) / "cosmos.sqlite3")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_persists_categories_and_scopes_search_by_owner(self) -> None:
        self.store.create(
            owner_id="alice",
            category="user",
            content="I prefer concise explanations.",
            source="user-confirmed",
            confidence=0.9,
            verified=True,
        )
        self.store.create(owner_id="bob", category="user", content="I prefer concise explanations.")

        results = self.store.search(owner_id="alice", query="concise explanations")

        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].owner_id, "alice")
        self.assertEqual(results[0].category, "user")
        self.assertTrue(results[0].verified)
        self.assertEqual(self.store.search(owner_id="carol", query="concise explanations"), [])

    def test_deduplicates_content_and_tracks_multiple_provenance_sources(self) -> None:
        first, created = self.store.create(
            owner_id="local", category="semantic", content="Use SQLite for local storage.", source="manual"
        )
        duplicate, duplicate_created = self.store.create(
            owner_id="local", category="semantic", content="  USE sqlite for local storage. ", source="verified-answer"
        )

        self.assertTrue(created)
        self.assertFalse(duplicate_created)
        self.assertEqual(first.id, duplicate.id)
        self.assertEqual(len(self.store.provenance(owner_id="local", memory_id=first.id)), 2)

    def test_working_memories_expire_and_can_be_purged(self) -> None:
        expired = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        record, _ = self.store.create(
            owner_id="local", category="working", content="temporary", expires_at=expired
        )

        self.assertEqual(self.store.list(owner_id="local"), [])
        self.assertEqual(self.store.purge_expired(owner_id="local"), 1)
        self.assertFalse(self.store.delete(owner_id="other", memory_id=record.id))

    def test_update_refreshes_search_index_and_delete_is_owner_scoped(self) -> None:
        record, _ = self.store.create(owner_id="local", category="procedural", content="Old workflow")
        updated = self.store.update(
            owner_id="local", memory_id=record.id, content="Reviewed workflow", source="correction"
        )

        self.assertIsNotNone(updated)
        self.assertEqual(self.store.search(owner_id="local", query="reviewed workflow")[0].id, record.id)
        self.assertEqual(self.store.search(owner_id="local", query="old"), [])
        self.assertFalse(self.store.delete(owner_id="other", memory_id=record.id))
        self.assertTrue(self.store.delete(owner_id="local", memory_id=record.id))

    def test_rejects_invalid_categories_and_bounds(self) -> None:
        with self.assertRaises(ValueError):
            self.store.create(owner_id="local", category="unknown", content="x")
        with self.assertRaises(ValueError):
            self.store.create(owner_id="local", category="user", content="x", confidence=2)
        with self.assertRaises(ValueError):
            self.store.list(owner_id="local", limit=101)


if __name__ == "__main__":
    unittest.main()