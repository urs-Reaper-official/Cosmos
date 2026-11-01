CREATE TABLE IF NOT EXISTS learning_experiences (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 160),
    input_text TEXT NOT NULL CHECK (length(input_text) BETWEEN 1 AND 12000),
    model_output TEXT NOT NULL CHECK (length(model_output) BETWEEN 1 AND 12000),
    desired_output TEXT CHECK (desired_output IS NULL OR length(desired_output) BETWEEN 1 AND 12000),
    feedback_type TEXT NOT NULL CHECK (feedback_type IN (
        'positive', 'negative', 'correction', 'task_outcome', 'tool_result',
        'verified_answer', 'evaluation_failure'
    )),
    rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    consented INTEGER NOT NULL CHECK (consented = 1),
    review_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (review_status IN ('pending', 'approved', 'rejected')),
    source_reference TEXT NOT NULL DEFAULT '' CHECK (length(source_reference) <= 500),
    fingerprint TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (owner_id, fingerprint),
    UNIQUE (id, owner_id)
);

CREATE INDEX IF NOT EXISTS learning_experiences_review_idx
    ON learning_experiences (owner_id, review_status, created_at DESC);

CREATE TABLE IF NOT EXISTS learning_datasets (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL CHECK (length(owner_id) BETWEEN 1 AND 160),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    version INTEGER NOT NULL CHECK (version > 0),
    created_at TEXT NOT NULL,
    train_count INTEGER NOT NULL DEFAULT 0 CHECK (train_count >= 0),
    validation_count INTEGER NOT NULL DEFAULT 0 CHECK (validation_count >= 0),
    test_count INTEGER NOT NULL DEFAULT 0 CHECK (test_count >= 0),
    UNIQUE (owner_id, name, version),
    UNIQUE (id, owner_id)
);

CREATE INDEX IF NOT EXISTS learning_datasets_owner_idx
    ON learning_datasets (owner_id, name, version DESC);

CREATE TABLE IF NOT EXISTS learning_dataset_examples (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dataset_id TEXT NOT NULL,
    owner_id TEXT NOT NULL,
    experience_id TEXT NOT NULL,
    split TEXT NOT NULL CHECK (split IN ('train', 'validation', 'test')),
    input_text TEXT NOT NULL,
    target_text TEXT NOT NULL,
    feedback_type TEXT NOT NULL,
    rating INTEGER,
    source_reference TEXT NOT NULL,
    quality_score REAL NOT NULL CHECK (quality_score BETWEEN 0 AND 1),
    created_at TEXT NOT NULL,
    UNIQUE (dataset_id, experience_id),
    FOREIGN KEY (dataset_id, owner_id)
        REFERENCES learning_datasets (id, owner_id) ON DELETE CASCADE,
    FOREIGN KEY (experience_id, owner_id)
        REFERENCES learning_experiences (id, owner_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS learning_dataset_examples_split_idx
    ON learning_dataset_examples (dataset_id, split, id);