PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    email         TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    role          TEXT    NOT NULL CHECK(role IN ('admin','referee','head_judge')) DEFAULT 'referee',
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS judge_roles (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    key          TEXT    NOT NULL UNIQUE,
    name         TEXT    NOT NULL,
    granularity  TEXT    NOT NULL CHECK(granularity IN ('attempt','element')) DEFAULT 'attempt',
    is_deduction INTEGER NOT NULL DEFAULT 0 CHECK(is_deduction IN (0,1)),
    max_value    REAL,
    score_min    REAL    NOT NULL DEFAULT 0,
    score_max    REAL
);

CREATE TABLE IF NOT EXISTS panel_templates (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS panel_template_slots (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_template_id INTEGER NOT NULL REFERENCES panel_templates(id) ON DELETE CASCADE,
    judge_role_id     INTEGER NOT NULL REFERENCES judge_roles(id) ON DELETE CASCADE,
    judge_count       INTEGER NOT NULL DEFAULT 1 CHECK(judge_count > 0),
    drop_high         INTEGER NOT NULL DEFAULT 0,
    drop_low          INTEGER NOT NULL DEFAULT 0,
    combine           TEXT    NOT NULL CHECK(combine IN ('sum','mean','median')) DEFAULT 'sum',
    multiplier        REAL    NOT NULL DEFAULT 1,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    UNIQUE(panel_template_id, judge_role_id)
);

CREATE TABLE IF NOT EXISTS competitions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    name              TEXT NOT NULL,
    date              TEXT,
    status            TEXT NOT NULL CHECK(status IN ('planned','active','closed')) DEFAULT 'planned',
    panel_template_id INTEGER REFERENCES panel_templates(id),
    created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
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

CREATE TABLE IF NOT EXISTS panel_assignments (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    competition_id INTEGER NOT NULL REFERENCES competitions(id) ON DELETE CASCADE,
    judge_role_id  INTEGER NOT NULL REFERENCES judge_roles(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(competition_id, judge_role_id, user_id)
);

CREATE TABLE IF NOT EXISTS rounds (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id           INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    name               TEXT    NOT NULL,
    round_order        INTEGER NOT NULL DEFAULT 0,
    status             TEXT    NOT NULL CHECK(status IN ('not_started','in_progress','completed')) DEFAULT 'not_started',
    current_attempt_id INTEGER REFERENCES attempts(id) ON DELETE SET NULL
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
    element_count  INTEGER NOT NULL DEFAULT 10 CHECK(element_count > 0),
    UNIQUE(entry_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS scores (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id           INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    panel_assignment_id  INTEGER NOT NULL REFERENCES panel_assignments(id) ON DELETE CASCADE,
    judge_role_id        INTEGER NOT NULL REFERENCES judge_roles(id),
    score                REAL    NOT NULL,
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(attempt_id, panel_assignment_id)
);

CREATE TABLE IF NOT EXISTS element_scores (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id           INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    panel_assignment_id  INTEGER NOT NULL REFERENCES panel_assignments(id) ON DELETE CASCADE,
    judge_role_id        INTEGER NOT NULL REFERENCES judge_roles(id),
    element_number       INTEGER NOT NULL CHECK(element_number > 0),
    value                REAL    NOT NULL,
    created_at           TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE(attempt_id, panel_assignment_id, element_number)
);

CREATE INDEX IF NOT EXISTS idx_entries_round              ON entries(round_id);
CREATE INDEX IF NOT EXISTS idx_attempts_entry             ON attempts(entry_id);
CREATE INDEX IF NOT EXISTS idx_scores_attempt              ON scores(attempt_id);
CREATE INDEX IF NOT EXISTS idx_scores_judge_role           ON scores(attempt_id, judge_role_id);
CREATE INDEX IF NOT EXISTS idx_element_scores_lookup       ON element_scores(attempt_id, judge_role_id, element_number);
CREATE INDEX IF NOT EXISTS idx_sportsmen_comp              ON sportsmen(competition_id);
CREATE INDEX IF NOT EXISTS idx_groups_comp                 ON groups(competition_id);
CREATE INDEX IF NOT EXISTS idx_rounds_group                ON rounds(group_id);
CREATE INDEX IF NOT EXISTS idx_panel_template_slots_tpl    ON panel_template_slots(panel_template_id);
CREATE INDEX IF NOT EXISTS idx_panel_assignments_comp      ON panel_assignments(competition_id);
