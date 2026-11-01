CREATE TABLE IF NOT EXISTS learning_experience_provenance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    experience_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    source_reference TEXT NOT NULL DEFAULT '' CHECK (length(source_reference) <= 500),
    created_at TEXT NOT NULL,
    UNIQUE (experience_id, source_reference),
    FOREIGN KEY (experience_id, owner_id)
        REFERENCES learning_experiences (id, owner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS learning_experience_provenance_owner_idx
    ON learning_experience_provenance (owner_id, experience_id, created_at);