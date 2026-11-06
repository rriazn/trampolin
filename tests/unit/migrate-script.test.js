import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const script = path.resolve(__dirname, '../../src/migrate.js');

const runMigrate = (dbPath) => execFileSync('node', [script], { env: { ...process.env, DB_PATH: dbPath }, encoding: 'utf8' });

describe('src/migrate.js', () => {
  it('creates a missing database and upgrades an old one', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-'));
    const dbPath = path.join(dir, 'trampolin.db');
    try {
      expect(runMigrate(dbPath)).toContain('Database is up to date.');

      // an old database still has the head judge maximum of 10
      const old = new Database(dbPath);
      old.prepare("UPDATE judge_roles SET score_max = 10 WHERE key = 'head_judge'").run();
      old.close();

      runMigrate(dbPath);

      const upgraded = new Database(dbPath);
      expect(upgraded.prepare("SELECT score_max FROM judge_roles WHERE key = 'head_judge'").get().score_max).toBeNull();
      upgraded.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
