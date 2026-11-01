"""Consent-based, owner-scoped SQLite experience collection and review."""

from __future__ import annotations

import hashlib
import json
import math
import os
import sqlite3
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from cosmos.learning.privacy import contains_sensitive_data


FeedbackType = Literal[
    "positive",
    "negative",
    "correction",
    "task_outcome",
    "tool_result",
    "verified_answer",
    "evaluation_failure",
]
ReviewStatus = Literal["pending", "approved", "rejected"]
FEEDBACK_TYPES: tuple[FeedbackType, ...] = (
    "positive",
    "negative",
    "correction",
    "task_outcome",
    "tool_result",
    "verified_answer",
    "evaluation_failure",
)
MAX_EXPERIENCE_CHARS = 12000


class _ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


@dataclass(frozen=True)
class LearningExperience:
    id: str
    owner_id: str
    input_text: str
    model_output: str
    desired_output: str | None
    feedback_type: FeedbackType
    rating: int | None
    consented: bool
    review_status: ReviewStatus
    source_reference: str
    created_at: str
    updated_at: str

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


@dataclass(frozen=True)
class LearningDatasetExample:
    experience_id: str
    split: Literal["train", "validation", "test"]
    input_text: str
    target_text: str
    feedback_type: FeedbackType
    rating: int | None
    source_reference: str
    quality_score: float


@dataclass(frozen=True)
class LearningDataset:
    id: str
    owner_id: str
    name: str
    version: int
    created_at: str
    train_count: int
    validation_count: int
    test_count: int
    examples: tuple[LearningDatasetExample, ...]


class SQLiteLearningStore:
    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path).expanduser().resolve()
        self.database_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(
            self.database_path,
            timeout=10,
            factory=_ClosingConnection,
        )
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize(self) -> None:
        migrations_dir = Path(__file__).parent.parent / "migrations"
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
            )
            for version, migration_name in (
                ("002_learning", "002_learning.sql"),
                ("003_learning_dataset_counts", "003_learning_dataset_counts.sql"),
                ("004_learning_provenance", "004_learning_provenance.sql"),
            ):
                applied = connection.execute(
                    "SELECT 1 FROM schema_migrations WHERE version = ?", (version,)
                ).fetchone()
                if applied:
                    continue
                connection.executescript((migrations_dir / migration_name).read_text(encoding="utf-8"))
                connection.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (version, _now()),
                )
        try:
            os.chmod(self.database_path, 0o600)
        except OSError:
            pass

    def collect(
        self,
        *,
        owner_id: str,
        input_text: str,
        model_output: str,
        feedback_type: FeedbackType,
        consent: bool,
        desired_output: str | None = None,
        rating: int | None = None,
        source_reference: str = "",
    ) -> tuple[LearningExperience, bool] | None:
        if not isinstance(consent, bool):
            raise ValueError("consent must be an explicit boolean")
        if not consent:
            return None

        owner = _validate_owner(owner_id)
        prompt = _validate_text(input_text, "input_text")
        output = _validate_text(model_output, "model_output")
        desired = _validate_text(desired_output, "desired_output") if desired_output else None
        if feedback_type not in FEEDBACK_TYPES:
            raise ValueError("unsupported feedback type")
        if feedback_type == "correction" and desired is None:
            raise ValueError("a correction requires desired_output")
        if rating is not None and (isinstance(rating, bool) or not 1 <= rating <= 5):
            raise ValueError("rating must be between 1 and 5")
        reference = source_reference.strip()
        if len(reference) > 500:
            raise ValueError("source_reference cannot exceed 500 characters")
        target = desired or output
        if contains_sensitive_data(f"{prompt}\n{output}\n{target}\n{reference}"):
            raise ValueError("experience appears to contain sensitive data and was not stored")

        fingerprint = _fingerprint(prompt, target, feedback_type)
        now = _now()
        experience_id = str(uuid.uuid4())
        with self._connect() as connection:
            cursor = connection.execute(
                """INSERT OR IGNORE INTO learning_experiences (
                    id, owner_id, input_text, model_output, desired_output, feedback_type,
                    rating, consented, review_status, source_reference, fingerprint,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?, ?, ?)""",
                (
                    experience_id,
                    owner,
                    prompt,
                    output,
                    desired,
                    feedback_type,
                    rating,
                    reference,
                    fingerprint,
                    now,
                    now,
                ),
            )
            inserted = cursor.rowcount == 1
            row = connection.execute(
                "SELECT * FROM learning_experiences WHERE owner_id = ? AND fingerprint = ?",
                (owner, fingerprint),
            ).fetchone()
            connection.execute(
                """INSERT OR IGNORE INTO learning_experience_provenance (
                    experience_id, owner_id, source_reference, created_at
                ) VALUES (?, ?, ?, ?)""",
                (row["id"], owner, reference, now),
            )
        return _experience(row), inserted

    def list_experiences(
        self,
        *,
        owner_id: str,
        status: ReviewStatus | None = None,
        limit: int = 100,
    ) -> list[LearningExperience]:
        owner = _validate_owner(owner_id)
        if status is not None and status not in ("pending", "approved", "rejected"):
            raise ValueError("unsupported review status")
        if isinstance(limit, bool) or not 1 <= limit <= 500:
            raise ValueError("limit must be between 1 and 500")
        query = "SELECT * FROM learning_experiences WHERE owner_id = ?"
        parameters: list[object] = [owner]
        if status:
            query += " AND review_status = ?"
            parameters.append(status)
        query += " ORDER BY created_at DESC LIMIT ?"
        parameters.append(limit)
        with self._connect() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [_experience(row) for row in rows]

    def review(
        self,
        *,
        owner_id: str,
        experience_id: str,
        decision: Literal["approved", "rejected"],
    ) -> LearningExperience | None:
        owner = _validate_owner(owner_id)
        if decision not in ("approved", "rejected"):
            raise ValueError("decision must be approved or rejected")
        now = _now()
        with self._connect() as connection:
            connection.execute(
                """UPDATE learning_experiences SET review_status = ?, updated_at = ?
                   WHERE id = ? AND owner_id = ?""",
                (decision, now, experience_id, owner),
            )
            row = connection.execute(
                "SELECT * FROM learning_experiences WHERE id = ? AND owner_id = ?",
                (experience_id, owner),
            ).fetchone()
        return _experience(row) if row else None

    def delete(self, *, owner_id: str, experience_id: str) -> bool:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM learning_experiences WHERE id = ? AND owner_id = ?",
                (experience_id, owner),
            )
        return cursor.rowcount > 0

    def provenance(self, *, owner_id: str, experience_id: str) -> list[dict[str, str]]:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT source_reference, created_at FROM learning_experience_provenance
                   WHERE experience_id = ? AND owner_id = ? ORDER BY created_at, id""",
                (experience_id, owner),
            ).fetchall()
        return [dict(row) for row in rows]

    def create_dataset(
        self,
        *,
        owner_id: str,
        name: str,
        train_ratio: float = 0.8,
        validation_ratio: float = 0.1,
        test_ratio: float = 0.1,
        minimum_quality: float = 0.6,
        max_examples: int = 20000,
    ) -> LearningDataset:
        owner = _validate_owner(owner_id)
        dataset_name = name.strip()
        if not dataset_name or len(dataset_name) > 120:
            raise ValueError("dataset name must contain 1 to 120 characters")
        ratios = (train_ratio, validation_ratio, test_ratio)
        if any(not math.isfinite(ratio) or ratio <= 0 or ratio >= 1 for ratio in ratios):
            raise ValueError("each split ratio must be greater than 0 and less than 1")
        if not math.isclose(sum(ratios), 1.0, rel_tol=0, abs_tol=1e-6):
            raise ValueError("split ratios must sum to 1")
        if not math.isfinite(minimum_quality) or not 0 <= minimum_quality <= 1:
            raise ValueError("minimum_quality must be between 0 and 1")
        if isinstance(max_examples, bool) or not 3 <= max_examples <= 20000:
            raise ValueError("max_examples must be between 3 and 20000")

        eligible = []
        for experience in self._approved_for_dataset(owner):
            if experience.feedback_type not in {
                "positive",
                "correction",
                "task_outcome",
                "tool_result",
                "verified_answer",
            } and not experience.desired_output:
                continue
            target = experience.desired_output or experience.model_output
            if contains_sensitive_data(
                f"{experience.input_text}\n{experience.model_output}\n{target}"
            ):
                continue
            quality = _quality_score(experience)
            if quality >= minimum_quality:
                eligible.append((experience, target, quality))

        if len(eligible) < 3:
            raise ValueError("at least three approved, usable examples are required")
        eligible = eligible[:max_examples]
        eligible.sort(key=lambda item: hashlib.sha256(item[0].id.encode()).hexdigest())
        train_count, validation_count, test_count = _split_counts(
            len(eligible), train_ratio, validation_ratio
        )
        split_names = (
            ["train"] * train_count
            + ["validation"] * validation_count
            + ["test"] * test_count
        )
        timestamp = _now()
        dataset_id = str(uuid.uuid4())
        examples = tuple(
            LearningDatasetExample(
                experience_id=experience.id,
                split=split_names[index],
                input_text=experience.input_text,
                target_text=target,
                feedback_type=experience.feedback_type,
                rating=experience.rating,
                source_reference=experience.source_reference,
                quality_score=quality,
            )
            for index, (experience, target, quality) in enumerate(eligible)
        )

        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            row = connection.execute(
                "SELECT coalesce(max(version), 0) + 1 AS version FROM learning_datasets "
                "WHERE owner_id = ? AND name = ?",
                (owner, dataset_name),
            ).fetchone()
            version = int(row["version"])
            connection.execute(
                """INSERT INTO learning_datasets (
                    id, owner_id, name, version, created_at,
                    train_count, validation_count, test_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    dataset_id,
                    owner,
                    dataset_name,
                    version,
                    timestamp,
                    train_count,
                    validation_count,
                    test_count,
                ),
            )
            connection.executemany(
                """INSERT INTO learning_dataset_examples (
                    dataset_id, owner_id, experience_id, split, input_text, target_text,
                    feedback_type, rating, source_reference, quality_score, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        dataset_id,
                        owner,
                        example.experience_id,
                        example.split,
                        example.input_text,
                        example.target_text,
                        example.feedback_type,
                        example.rating,
                        example.source_reference,
                        example.quality_score,
                        timestamp,
                    )
                    for example in examples
                ],
            )
        return LearningDataset(
            id=dataset_id,
            owner_id=owner,
            name=dataset_name,
            version=version,
            created_at=timestamp,
            train_count=train_count,
            validation_count=validation_count,
            test_count=test_count,
            examples=examples,
        )

    def list_datasets(self, *, owner_id: str) -> list[LearningDataset]:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            datasets = connection.execute(
                "SELECT * FROM learning_datasets WHERE owner_id = ? ORDER BY name, version DESC",
                (owner,),
            ).fetchall()
            result = []
            for dataset in datasets:
                rows = connection.execute(
                    """SELECT experience_id, split, input_text, target_text,
                              feedback_type, rating, source_reference, quality_score
                       FROM learning_dataset_examples
                       WHERE dataset_id = ? AND owner_id = ? ORDER BY id""",
                    (dataset["id"], owner),
                ).fetchall()
                result.append(
                    LearningDataset(
                        id=dataset["id"],
                        owner_id=owner,
                        name=dataset["name"],
                        version=dataset["version"],
                        created_at=dataset["created_at"],
                        train_count=dataset["train_count"],
                        validation_count=dataset["validation_count"],
                        test_count=dataset["test_count"],
                        examples=tuple(
                            LearningDatasetExample(
                                experience_id=row["experience_id"],
                                split=row["split"],
                                input_text=row["input_text"],
                                target_text=row["target_text"],
                                feedback_type=row["feedback_type"],
                                rating=row["rating"],
                                source_reference=row["source_reference"],
                                quality_score=row["quality_score"],
                            )
                            for row in rows
                        ),
                    )
                )
        return result

    def export_dataset_jsonl(self, *, owner_id: str, dataset_id: str) -> str:
        owner = _validate_owner(owner_id)
        dataset = next(
            (item for item in self.list_datasets(owner_id=owner) if item.id == dataset_id), None
        )
        if dataset is None:
            raise ValueError("dataset not found")
        return "\n".join(
            json.dumps(
                {
                    "messages": [
                        {"role": "user", "content": example.input_text},
                        {"role": "assistant", "content": example.target_text},
                    ],
                    "metadata": {
                        "experience_id": example.experience_id,
                        "split": example.split,
                        "feedback_type": example.feedback_type,
                        "rating": example.rating,
                        "source_references": self.provenance(
                            owner_id=owner, experience_id=example.experience_id
                        ),
                        "quality_score": example.quality_score,
                        "dataset_version": dataset.version,
                    },
                },
                ensure_ascii=False,
                sort_keys=True,
            )
            for example in dataset.examples
        )

    def _approved_for_dataset(self, owner_id: str) -> list[LearningExperience]:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT * FROM learning_experiences
                   WHERE owner_id = ? AND review_status = 'approved'
                   ORDER BY id""",
                (owner,),
            ).fetchall()
        return [_experience(row) for row in rows]


def _experience(row: sqlite3.Row) -> LearningExperience:
    return LearningExperience(
        id=row["id"],
        owner_id=row["owner_id"],
        input_text=row["input_text"],
        model_output=row["model_output"],
        desired_output=row["desired_output"],
        feedback_type=row["feedback_type"],
        rating=row["rating"],
        consented=bool(row["consented"]),
        review_status=row["review_status"],
        source_reference=row["source_reference"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


def _validate_owner(owner_id: str) -> str:
    owner = owner_id.strip()
    if not owner or len(owner) > 160:
        raise ValueError("owner_id must contain 1 to 160 characters")
    return owner


def _validate_text(value: str | None, name: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{name} must be text")
    text = value.strip()
    if not text or len(text) > MAX_EXPERIENCE_CHARS:
        raise ValueError(f"{name} must contain 1 to {MAX_EXPERIENCE_CHARS} characters")
    return text


def _fingerprint(prompt: str, target: str, feedback_type: str) -> str:
    normalized = "\0".join(
        " ".join(part.casefold().split()) for part in (prompt, target, feedback_type)
    )
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def _quality_score(experience: LearningExperience) -> float:
    score = experience.rating / 5 if experience.rating else 0.7
    if experience.feedback_type in {"correction", "verified_answer"}:
        score = max(score, 0.9)
    return round(min(1.0, score), 4)


def _split_counts(total: int, train_ratio: float, validation_ratio: float) -> tuple[int, int, int]:
    train_count = min(total - 2, max(1, round(total * train_ratio)))
    validation_count = min(total - train_count - 1, max(1, round(total * validation_ratio)))
    test_count = total - train_count - validation_count
    return train_count, validation_count, test_count


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")