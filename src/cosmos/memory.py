"""Local SQLite memory storage with FTS5 retrieval and explicit provenance."""

from __future__ import annotations

import hashlib
import math
import re
import sqlite3
import unicodedata
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal


MemoryCategory = Literal["working", "episodic", "semantic", "procedural", "user", "project"]
MEMORY_CATEGORIES: tuple[MemoryCategory, ...] = (
    "working",
    "episodic",
    "semantic",
    "procedural",
    "user",
    "project",
)
MAX_CONTENT_CHARS = 4000
MAX_OWNER_ID_CHARS = 160
MAX_SEARCH_CHARS = 500
WORKING_MEMORY_TTL = timedelta(hours=24)


class _ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


@dataclass(frozen=True)
class MemoryRecord:
    id: str
    owner_id: str
    category: MemoryCategory
    content: str
    source: str
    confidence: float
    verified: bool
    project_id: str | None
    created_at: str
    updated_at: str
    last_accessed_at: str
    expires_at: str | None
    score: float | None = None

    def as_dict(self) -> dict[str, object]:
        return asdict(self)


class SQLiteMemoryStore:
    def __init__(self, database_path: str | Path):
        self.database_path = Path(database_path).expanduser().resolve()
        if str(database_path) != ":memory:":
            self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=10, factory=_ClosingConnection)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA busy_timeout = 10000")
        return connection

    def _initialize(self) -> None:
        migration_path = Path(__file__).parent / "migrations" / "001_memory.sql"
        with self._connect() as connection:
            connection.execute("PRAGMA journal_mode = WAL")
            connection.execute(
                "CREATE TABLE IF NOT EXISTS schema_migrations "
                "(version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
            )
            applied = connection.execute(
                "SELECT 1 FROM schema_migrations WHERE version = ?", ("001_memory",)
            ).fetchone()
            if not applied:
                connection.executescript(migration_path.read_text(encoding="utf-8"))
                connection.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    ("001_memory", _now()),
                )

    def create(
        self,
        *,
        owner_id: str,
        category: MemoryCategory,
        content: str,
        source: str = "user",
        reference: str = "",
        confidence: float = 0.5,
        verified: bool = False,
        project_id: str | None = None,
        expires_at: str | None = None,
    ) -> tuple[MemoryRecord, bool]:
        owner = _validate_owner(owner_id)
        normalized_content = _validate_content(content)
        _validate_category(category)
        source_text = _validate_source(source)
        reference_text = reference.strip()[:500]
        if not 0 <= confidence <= 1:
            raise ValueError("confidence must be between 0 and 1")
        project = project_id.strip()[:160] if project_id else None
        created_at = _now()
        if category == "working" and expires_at is None:
            expires_at = (datetime.now(timezone.utc) + WORKING_MEMORY_TTL).isoformat()
        content_hash = _content_hash(category, normalized_content, project)
        memory_id = str(uuid.uuid4())

        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            existing = connection.execute(
                "SELECT * FROM memories WHERE owner_id = ? AND category = ? AND content_hash = ?",
                (owner, category, content_hash),
            ).fetchone()
            inserted = existing is None
            if inserted:
                connection.execute(
                    """INSERT INTO memories (
                        id, owner_id, category, content, content_hash, source, confidence,
                        verified, project_id, created_at, updated_at, last_accessed_at, expires_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        memory_id,
                        owner,
                        category,
                        normalized_content,
                        content_hash,
                        source_text,
                        confidence,
                        int(verified),
                        project,
                        created_at,
                        created_at,
                        created_at,
                        expires_at,
                    ),
                )
            else:
                memory_id = existing["id"]
                connection.execute(
                    """UPDATE memories SET updated_at = ?, last_accessed_at = ?,
                        confidence = max(confidence, ?), verified = max(verified, ?),
                        expires_at = coalesce(?, expires_at)
                        WHERE id = ? AND owner_id = ?""",
                    (created_at, created_at, confidence, int(verified), expires_at, memory_id, owner),
                )
            connection.execute(
                """INSERT OR IGNORE INTO memory_provenance (memory_id, source, reference, created_at)
                   VALUES (?, ?, ?, ?)""",
                (memory_id, source_text, reference_text, created_at),
            )
            row = connection.execute(
                "SELECT * FROM memories WHERE id = ? AND owner_id = ?", (memory_id, owner)
            ).fetchone()
        return _record(row), inserted

    def update(
        self,
        *,
        owner_id: str,
        memory_id: str,
        content: str,
        source: str = "user-correction",
        reference: str = "",
    ) -> MemoryRecord | None:
        owner = _validate_owner(owner_id)
        normalized_content = _validate_content(content)
        now = _now()
        with self._connect() as connection:
            current = connection.execute(
                "SELECT * FROM memories WHERE id = ? AND owner_id = ?", (memory_id, owner)
            ).fetchone()
            if current is None:
                return None
            content_hash = _content_hash(
                current["category"], normalized_content, current["project_id"]
            )
            duplicate = connection.execute(
                """SELECT id FROM memories WHERE owner_id = ? AND category = ?
                   AND content_hash = ? AND id != ?""",
                (owner, current["category"], content_hash, memory_id),
            ).fetchone()
            if duplicate:
                raise ValueError("An equivalent memory already exists.")
            connection.execute(
                """UPDATE memories SET content = ?, content_hash = ?, updated_at = ?,
                   last_accessed_at = ? WHERE id = ? AND owner_id = ?""",
                (normalized_content, content_hash, now, now, memory_id, owner),
            )
            connection.execute(
                """INSERT OR IGNORE INTO memory_provenance (memory_id, source, reference, created_at)
                   VALUES (?, ?, ?, ?)""",
                (memory_id, _validate_source(source), reference.strip()[:500], now),
            )
            row = connection.execute("SELECT * FROM memories WHERE id = ?", (memory_id,)).fetchone()
        return _record(row)

    def list(
        self,
        *,
        owner_id: str,
        category: str | None = None,
        limit: int = 100,
    ) -> list[MemoryRecord]:
        owner = _validate_owner(owner_id)
        _validate_category(category, allow_none=True)
        bounded_limit = _validate_limit(limit)
        now = _now()
        query = "SELECT * FROM memories WHERE owner_id = ? AND (expires_at IS NULL OR expires_at > ?)"
        values: list[object] = [owner, now]
        if category:
            query += " AND category = ?"
            values.append(category)
        query += " ORDER BY updated_at DESC LIMIT ?"
        values.append(bounded_limit)
        with self._connect() as connection:
            rows = connection.execute(query, values).fetchall()
        return [_record(row) for row in rows]

    def search(
        self,
        *,
        owner_id: str,
        query: str,
        category: str | None = None,
        project_id: str | None = None,
        limit: int = 10,
    ) -> list[MemoryRecord]:
        owner = _validate_owner(owner_id)
        search_text = query.strip()[:MAX_SEARCH_CHARS]
        _validate_category(category, allow_none=True)
        bounded_limit = min(_validate_limit(limit), 50)
        if not search_text:
            return self.list(owner_id=owner, category=category, limit=bounded_limit)

        terms = re.findall(r"[\w]+", search_text, flags=re.UNICODE)[:32]
        if not terms:
            return []
        match = " OR ".join(f'"{term.replace(chr(34), chr(34) * 2)}"' for term in terms)
        now = _now()
        sql = """SELECT memories.*, bm25(memories_fts) AS lexical_rank
                 FROM memories_fts JOIN memories ON memories.id = memories_fts.memory_id
                 WHERE memories_fts MATCH ? AND memories.owner_id = ?
                 AND (memories.expires_at IS NULL OR memories.expires_at > ?)"""
        values: list[object] = [match, owner, now]
        if category:
            sql += " AND memories.category = ?"
            values.append(category)
        if project_id:
            sql += " AND memories.project_id = ?"
            values.append(project_id[:160])
        sql += " ORDER BY lexical_rank LIMIT ?"
        values.append(bounded_limit * 3)

        with self._connect() as connection:
            rows = connection.execute(sql, values).fetchall()
            current = datetime.now(timezone.utc)
            ranked: list[tuple[float, sqlite3.Row]] = []
            for row in rows:
                age = max(0.0, (current - _parse_time(row["last_accessed_at"])).total_seconds() / 86400)
                lexical = 1.0 / (1.0 + abs(float(row["lexical_rank"])))
                recency = math.exp(-age / 45)
                confidence = float(row["confidence"])
                score = 0.65 * lexical + 0.25 * recency + 0.10 * confidence
                ranked.append((score, row))
            ranked.sort(key=lambda item: item[0], reverse=True)
            selected = ranked[:bounded_limit]
            for _, row in selected:
                connection.execute(
                    "UPDATE memories SET last_accessed_at = ? WHERE id = ? AND owner_id = ?",
                    (now, row["id"], owner),
                )
        return [_record(row, score) for score, row in selected]

    def provenance(self, *, owner_id: str, memory_id: str) -> list[dict[str, str]]:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            rows = connection.execute(
                """SELECT p.source, p.reference, p.created_at FROM memory_provenance p
                   JOIN memories m ON m.id = p.memory_id
                   WHERE p.memory_id = ? AND m.owner_id = ? ORDER BY p.created_at""",
                (memory_id, owner),
            ).fetchall()
        return [dict(row) for row in rows]

    def delete(self, *, owner_id: str, memory_id: str) -> bool:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM memories WHERE id = ? AND owner_id = ?", (memory_id, owner)
            )
        return cursor.rowcount > 0

    def purge_expired(self, *, owner_id: str) -> int:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            cursor = connection.execute(
                "DELETE FROM memories WHERE owner_id = ? AND expires_at IS NOT NULL AND expires_at <= ?",
                (owner, _now()),
            )
        return cursor.rowcount

    def set_memory_enabled(self, *, owner_id: str, enabled: bool) -> None:
        owner = _validate_owner(owner_id)
        if not isinstance(enabled, bool):
            raise ValueError("enabled must be a boolean")
        with self._connect() as connection:
            connection.execute(
                """INSERT INTO memory_preferences (owner_id, memory_enabled, updated_at)
                   VALUES (?, ?, ?)
                   ON CONFLICT(owner_id) DO UPDATE SET
                     memory_enabled = excluded.memory_enabled,
                     updated_at = excluded.updated_at""",
                (owner, int(enabled), _now()),
            )

    def memory_enabled(self, *, owner_id: str) -> bool:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            row = connection.execute(
                "SELECT memory_enabled FROM memory_preferences WHERE owner_id = ?", (owner,)
            ).fetchone()
        return bool(row["memory_enabled"]) if row else False

    def stats(self, *, owner_id: str) -> dict[str, object]:
        owner = _validate_owner(owner_id)
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT category, count(*) AS count FROM memories WHERE owner_id = ? "
                "AND (expires_at IS NULL OR expires_at > ?) GROUP BY category",
                (owner, _now()),
            ).fetchall()
            count = sum(int(row["count"]) for row in rows)
            categories = {row["category"]: int(row["count"]) for row in rows}
        try:
            storage_bytes = self.database_path.stat().st_size
        except OSError:
            storage_bytes = 0
        return {
            "record_count": count,
            "categories": categories,
            "storage_bytes": storage_bytes,
            "memory_enabled": self.memory_enabled(owner_id=owner),
        }


def _record(row: sqlite3.Row, score: float | None = None) -> MemoryRecord:
    return MemoryRecord(
        id=row["id"],
        owner_id=row["owner_id"],
        category=row["category"],
        content=row["content"],
        source=row["source"],
        confidence=float(row["confidence"]),
        verified=bool(row["verified"]),
        project_id=row["project_id"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
        last_accessed_at=row["last_accessed_at"],
        expires_at=row["expires_at"],
        score=score,
    )


def _validate_owner(owner_id: str) -> str:
    value = owner_id.strip()
    if not value or len(value) > MAX_OWNER_ID_CHARS:
        raise ValueError("owner_id must contain 1 to 160 characters")
    return value


def _validate_content(content: str) -> str:
    value = unicodedata.normalize("NFC", content).strip()
    if not value or len(value) > MAX_CONTENT_CHARS:
        raise ValueError(f"content must contain 1 to {MAX_CONTENT_CHARS} characters")
    return value


def _validate_source(source: str) -> str:
    value = source.strip()
    if not value or len(value) > 240:
        raise ValueError("source must contain 1 to 240 characters")
    return value


def _validate_category(category: str | None, allow_none: bool = False) -> None:
    if category is None and allow_none:
        return
    if category not in MEMORY_CATEGORIES:
        raise ValueError("unsupported memory category")


def _validate_limit(limit: int) -> int:
    if not 1 <= limit <= 100:
        raise ValueError("limit must be between 1 and 100")
    return limit


def _content_hash(category: str, content: str, project_id: str | None) -> str:
    normalized = " ".join(unicodedata.normalize("NFKC", content).casefold().split())
    key = f"{category}\0{project_id or ''}\0{normalized}"
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)