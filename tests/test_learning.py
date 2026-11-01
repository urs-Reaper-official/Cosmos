import tempfile
import unittest
import json
from pathlib import Path

from cosmos.learning import SQLiteLearningStore


class SQLiteLearningStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SQLiteLearningStore(Path(self.temp_dir.name) / "learning.sqlite3")

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def collect(self, owner: str = "alice", **overrides):
        values = {
            "owner_id": owner,
            "input_text": "Explain a binary search.",
            "model_output": "It searches a sorted sequence by halving the range.",
            "feedback_type": "positive",
            "consent": True,
            "rating": 5,
            "source_reference": "conversation-1",
        }
        values.update(overrides)
        return self.store.collect(**values)

    def test_collection_requires_explicit_consent(self) -> None:
        self.assertIsNone(self.collect(consent=False))
        with self.assertRaises(ValueError):
            self.collect(consent="yes")
        self.assertEqual(self.store.list_experiences(owner_id="alice"), [])

    def test_new_examples_require_owner_review(self) -> None:
        experience, inserted = self.collect()
        self.assertTrue(inserted)
        self.assertEqual(experience.review_status, "pending")
        self.assertEqual(self.store.list_experiences(owner_id="alice", status="approved"), [])

    def test_sensitive_data_is_rejected_before_persistence(self) -> None:
        for value in (
            "Contact me at private@example.com",
            "Use password=hunter2",
            "My phone is +1 (415) 555-0199",
            "Token: sk-" + "a" * 24,
        ):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.collect(input_text=value)
        self.assertEqual(self.store.list_experiences(owner_id="alice"), [])

    def test_correction_requires_target_and_duplicates_are_scoped(self) -> None:
        with self.assertRaises(ValueError):
            self.collect(feedback_type="correction")
        first, inserted = self.collect(feedback_type="correction", desired_output="Use binary search.")
        duplicate, duplicate_inserted = self.collect(
            feedback_type="correction",
            desired_output="Use binary search.",
            source_reference="correction-review",
        )
        self.assertTrue(inserted)
        self.assertFalse(duplicate_inserted)
        self.assertEqual(first.id, duplicate.id)
        self.assertEqual(
            {item["source_reference"] for item in self.store.provenance(
                owner_id="alice", experience_id=first.id
            )},
            {"conversation-1", "correction-review"},
        )
        other_owner, other_inserted = self.collect(
            owner="bob", feedback_type="correction", desired_output="Use binary search."
        )
        self.assertTrue(other_inserted)
        self.assertNotEqual(first.id, other_owner.id)

    def test_review_and_delete_are_owner_scoped(self) -> None:
        experience, _ = self.collect()
        self.assertIsNone(
            self.store.review(owner_id="bob", experience_id=experience.id, decision="approved")
        )
        approved = self.store.review(
            owner_id="alice", experience_id=experience.id, decision="approved"
        )
        self.assertEqual(approved.review_status, "approved")
        self.assertFalse(self.store.delete(owner_id="bob", experience_id=experience.id))
        self.assertTrue(self.store.delete(owner_id="alice", experience_id=experience.id))

    def test_invalid_ratings_and_feedback_types_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            self.collect(rating=6)
        with self.assertRaises(ValueError):
            self.collect(feedback_type="automatic_training")

    def test_dataset_uses_only_approved_examples_and_preserves_provenance(self) -> None:
        experiences = [
            self.collect(
                input_text=f"Question {index}",
                model_output=f"Answer {index}",
                source_reference=f"conversation-{index}",
            )[0]
            for index in range(5)
        ]
        for experience in experiences[:4]:
            self.store.review(owner_id="alice", experience_id=experience.id, decision="approved")

        dataset = self.store.create_dataset(
            owner_id="alice",
            name="assistant-feedback",
            train_ratio=0.5,
            validation_ratio=0.25,
            test_ratio=0.25,
        )

        self.assertEqual((dataset.train_count, dataset.validation_count, dataset.test_count), (2, 1, 1))
        self.assertEqual(len(dataset.examples), 4)
        self.assertTrue(all(example.split in {"train", "validation", "test"} for example in dataset.examples))
        self.assertTrue(all(example.quality_score >= 0.6 for example in dataset.examples))
        exported = [json.loads(line) for line in self.store.export_dataset_jsonl(
            owner_id="alice", dataset_id=dataset.id
        ).splitlines()]
        self.assertEqual(len(exported), 4)
        self.assertTrue(all("source_references" in item["metadata"] for item in exported))
        reference_by_id = {
            experience.id: f"conversation-{index}"
            for index, experience in enumerate(experiences[:4])
        }
        for item in exported:
            self.assertEqual(
                item["metadata"]["source_references"][0]["source_reference"],
                reference_by_id[item["metadata"]["experience_id"]],
            )

    def test_dataset_versions_and_reads_are_owner_scoped(self) -> None:
        for index in range(3):
            experience, _ = self.collect(
                input_text=f"Version question {index}", model_output=f"Version answer {index}"
            )
            self.store.review(owner_id="alice", experience_id=experience.id, decision="approved")

        first = self.store.create_dataset(owner_id="alice", name="curated")
        second = self.store.create_dataset(owner_id="alice", name="curated")

        self.assertEqual((first.version, second.version), (1, 2))
        self.assertEqual([dataset.version for dataset in self.store.list_datasets(owner_id="alice")], [2, 1])
        self.assertEqual(self.store.list_datasets(owner_id="bob"), [])
        with self.assertRaises(ValueError):
            self.store.export_dataset_jsonl(owner_id="bob", dataset_id=first.id)

    def test_dataset_requires_three_approved_examples(self) -> None:
        experience, _ = self.collect()
        self.store.review(owner_id="alice", experience_id=experience.id, decision="approved")
        with self.assertRaises(ValueError):
            self.store.create_dataset(owner_id="alice", name="too-small")

    def test_deleting_source_example_keeps_dataset_counts_consistent(self) -> None:
        experiences = [
            self.collect(
                input_text=f"Delete question {index}", model_output=f"Delete answer {index}"
            )[0]
            for index in range(3)
        ]
        for experience in experiences:
            self.store.review(owner_id="alice", experience_id=experience.id, decision="approved")
        dataset = self.store.create_dataset(owner_id="alice", name="delete-test")

        self.assertTrue(
            self.store.delete(owner_id="alice", experience_id=dataset.examples[0].experience_id)
        )
        updated = self.store.list_datasets(owner_id="alice")[0]
        self.assertEqual(
            updated.train_count + updated.validation_count + updated.test_count,
            len(updated.examples),
        )


if __name__ == "__main__":
    unittest.main()