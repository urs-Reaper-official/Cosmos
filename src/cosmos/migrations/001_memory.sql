CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN (
        'working', 'episodic', 'semantic', 'procedural', 'user', 'project'
    )),
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
    content_hash TEXT NOT NULL,
    source TEXT NOT NULL CHECK (length(source) BETWEEN 1 AND 240),
    confidence REAL NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
    verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    project_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    expires_at TEXT,
    UNIQUE (owner_id, category, content_hash)
);

CREATE INDEX IF NOT EXISTS memories_owner_category_idx
    ON memories (owner_id, category, updated_at DESC);
CREATE INDEX IF NOT EXISTS memories_expiry_idx
    ON memories (expires_at) WHERE expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS memory_provenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    source TEXT NOT NULL,
    reference TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (memory_id, source, reference)
);

CREATE TABLE IF NOT EXISTS memory_preferences (
    owner_id TEXT PRIMARY KEY,
    memory_enabled INTEGER NOT NULL DEFAULT 0 CHECK (memory_enabled IN (0, 1)),
    updated_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    memory_id UNINDEXED,
    owner_id UNINDEXED,
    category UNINDEXED,
    content,
    tokenize = 'unicode61'
);

CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts (memory_id, owner_id, category, content)
    VALUES (new.id, new.owner_id, new.category, new.content);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    DELETE FROM memories_fts WHERE memory_id = old.id;
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE OF content, owner_id, category ON memories BEGIN
    DELETE FROM memories_fts WHERE memory_id = old.id;
    INSERT INTO memories_fts (memory_id, owner_id, category, content)
    VALUES (new.id, new.owner_id, new.category, new.content);
END;