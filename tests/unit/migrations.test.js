import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db as appDb } from './services/testHelpers.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const Database = require('better-sqlite3');
const { addColumnIfMissing, runMigrations } = require('../../src/db/migrations.js');

// minimal copy of the pre-synchro tables, as found in an existing dev or production db file
function makeOldDb() {
  const old = new Database(':memory:');
  old.exec(`
    CREATE TABLE judge_roles (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE panel_templates (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, name TEXT NOT NULL);
    CREATE TABLE competitions (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL);
    CREATE TABLE sportsmen (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, competition_id INTEGER NOT NULL);
    INSERT INTO judge_roles (key, name) VALUES ('execution', 'Execution');
    INSERT INTO panel_templates (key, name) VALUES ('fig', 'FIG Panel');
    INSERT INTO competitions (name) VALUES ('Old Cup');
    INSERT INTO sportsmen (name, competition_id) VALUES ('Old Athlete', 1);
  `);
  return old;
}

function columnNames(database, table) {
  return database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

describe('addColumnIfMissing', () => {
  it('adds a missing column and applies its default to existing rows', () => {
    const old = makeOldDb();

    addColumnIfMissing(old, 'competitions', 'type', "TEXT NOT NULL DEFAULT 'individual'");

    expect(columnNames(old, 'competitions')).toContain('type');
    expect(old.prepare('SELECT type FROM competitions WHERE id=1').get().type).toBe('individual');
  });

  it('does nothing when the column already exists', () => {
    const old = makeOldDb();
    addColumnIfMissing(old, 'competitions', 'type', "TEXT NOT NULL DEFAULT 'individual'");
    old.prepare("UPDATE competitions SET type='synchro' WHERE id=1").run();

    expect(() => addColumnIfMissing(old, 'competitions', 'type', "TEXT NOT NULL DEFAULT 'individual'")).not.toThrow();

    expect(old.prepare('SELECT type FROM competitions WHERE id=1').get().type).toBe('synchro');
  });
});

describe('runMigrations', () => {
  it('adds every synchro column to an old-schema db and keeps existing rows', () => {
    const old = makeOldDb();

    runMigrations(old);

    expect(columnNames(old, 'competitions')).toContain('type');
    expect(columnNames(old, 'panel_templates')).toContain('competition_type');
    expect(columnNames(old, 'judge_roles')).toContain('has_landing');
    expect(columnNames(old, 'sportsmen')).toEqual(expect.arrayContaining(['partner_name', 'partner_club', 'partner_gender', 'partner_birth_year']));
    expect(old.prepare('SELECT type FROM competitions WHERE id=1').get().type).toBe('individual');
    expect(old.prepare('SELECT competition_type FROM panel_templates WHERE id=1').get().competition_type).toBe('individual');
    expect(old.prepare('SELECT has_landing FROM judge_roles WHERE id=1').get().has_landing).toBe(0);
    expect(old.prepare('SELECT partner_name FROM sportsmen WHERE id=1').get().partner_name).toBeNull();
  });

  it('keeps the CHECK constraints on migrated columns', () => {
    const old = makeOldDb();
    runMigrations(old);

    expect(() => old.prepare("INSERT INTO competitions (name, type) VALUES ('Bad', 'team')").run()).toThrow();
    expect(() => old.prepare("INSERT INTO panel_templates (key, name, competition_type) VALUES ('bad', 'Bad', 'team')").run()).toThrow();
    expect(() => old.prepare("INSERT INTO sportsmen (name, competition_id, partner_gender) VALUES ('X', 1, 'x')").run()).toThrow();
  });

  it('is idempotent', () => {
    const old = makeOldDb();
    runMigrations(old);

    expect(() => runMigrations(old)).not.toThrow();
  });
});

describe('schema.sql on a fresh db', () => {
  // schema only, so the columns must come from schema.sql and not from runMigrations
  function makeFreshDb() {
    const fresh = new Database(':memory:');
    fresh.exec(fs.readFileSync(path.join(__dirname, '../../src/db/schema.sql'), 'utf8'));
    return fresh;
  }

  it('creates the synchro columns without needing a migration', () => {
    const fresh = makeFreshDb();

    expect(columnNames(fresh, 'competitions')).toContain('type');
    expect(columnNames(fresh, 'panel_templates')).toContain('competition_type');
    expect(columnNames(fresh, 'judge_roles')).toContain('has_landing');
    expect(columnNames(fresh, 'sportsmen')).toEqual(expect.arrayContaining(['partner_name', 'partner_club', 'partner_gender', 'partner_birth_year']));
  });

  it('rejects an unknown competition type', () => {
    const fresh = makeFreshDb();

    expect(() => fresh.prepare("INSERT INTO competitions (name, type) VALUES ('Pairs', 'synchro')").run()).not.toThrow();
    expect(() => fresh.prepare("INSERT INTO competitions (name, type) VALUES ('Bad', 'team')").run()).toThrow(/CHECK/);
  });

  it('leaves runMigrations a no-op', () => {
    expect(() => runMigrations(makeFreshDb())).not.toThrow();
    expect(() => runMigrations(appDb)).not.toThrow();
  });
});
