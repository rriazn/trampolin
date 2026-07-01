PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('admin','referee')) DEFAULT 'referee',
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS competitions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    date       TEXT,
    status     TEXT NOT NULL CHECK(status IN ('planned','active','closed')) DEFAULT 'planned',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS groups (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    abbreviation   TEXT    NOT NULL,
    UNIQUE(competition_id, abbreviation)
);

CREATE TABLE IF NOT EXISTS sportsmen (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT    NOT NULL,
    club           TEXT,
    gender         TEXT    CHECK(gender IN ('m','f')),
    birth_year     INTEGER,
    routine        TEXT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    group_id       INTEGER REFERENCES groups(id) ON DELETE SET NULL,
    created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS rounds (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id    INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name        TEXT    NOT NULL,
    round_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    round_id     INTEGER NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
    sportsman_id INTEGER NOT NULL REFERENCES sportsmen(id) ON DELETE CASCADE,
    start_order  INTEGER NOT NULL DEFAULT 0,
    UNIQUE(round_id, sportsman_id)
);

CREATE TABLE IF NOT EXISTS attempts (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id       INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK(attempt_number > 0),
    status         TEXT    NOT NULL CHECK(status IN ('pending','scored')) DEFAULT 'pending',
    UNIQUE(entry_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id  INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    referee_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score       REAL    NOT NULL CHECK(score >= 0 AND score <= 10),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(attempt_id, referee_id)
);

CREATE INDEX IF NOT EXISTS idx_entries_round    ON entries(round_id);
CREATE INDEX IF NOT EXISTS idx_attempts_entry   ON attempts(entry_id);
CREATE INDEX IF NOT EXISTS idx_scores_attempt   ON scores(attempt_id);
CREATE INDEX IF NOT EXISTS idx_sportsmen_comp   ON sportsmen(competition_id);
CREATE INDEX IF NOT EXISTS idx_groups_comp      ON groups(competition_id);
CREATE INDEX IF NOT EXISTS idx_rounds_group     ON rounds(group_id);
