import { describe, it, expect } from 'vitest';
import { db, require, nextSeq } from './testHelpers.js';
const { createUser, updateUser, normalizeRole } = require('../../../src/services/users.service.js');

describe('normalizeRole', () => {
  it('passes through admin and head_judge', () => {
    expect(normalizeRole('admin')).toBe('admin');
    expect(normalizeRole('head_judge')).toBe('head_judge');
  });

  it('falls back to referee for anything else', () => {
    expect(normalizeRole('referee')).toBe('referee');
    expect(normalizeRole('superuser')).toBe('referee');
    expect(normalizeRole(undefined)).toBe('referee');
  });
});

describe('createUser', () => {
  it('creates a user with a hashed password and a normalized role', async () => {
    const email = `create${nextSeq()}@test.com`;
    await createUser('Jane', email, 'plaintext-pw', 'not-a-real-role');

    const row = db.prepare('SELECT * FROM users WHERE email=?').get(email);
    expect(row).toBeDefined();
    expect(row.name).toBe('Jane');
    expect(row.role).toBe('referee'); // normalized, since 'not-a-real-role' isn't valid
    expect(row.password_hash).not.toBe('plaintext-pw');
  });

  it('preserves the head_judge role', async () => {
    const email = `hj${nextSeq()}@test.com`;
    await createUser('Judge', email, 'pw', 'head_judge');
    const row = db.prepare('SELECT role FROM users WHERE email=?').get(email);
    expect(row.role).toBe('head_judge');
  });
});

describe('updateUser', () => {
  it('rehashes the password when one is provided', async () => {
    const email = `upd${nextSeq()}@test.com`;
    await createUser('Original', email, 'first-pw', 'referee');
    const before = db.prepare('SELECT * FROM users WHERE email=?').get(email);

    await updateUser(before.id, 'Renamed', email, 'second-pw', 'admin');

    const after = db.prepare('SELECT * FROM users WHERE id=?').get(before.id);
    expect(after.name).toBe('Renamed');
    expect(after.role).toBe('admin');
    expect(after.password_hash).not.toBe(before.password_hash);
  });

  it('keeps the existing password hash when none is provided', async () => {
    const email = `nopw${nextSeq()}@test.com`;
    await createUser('Kept', email, 'first-pw', 'referee');
    const before = db.prepare('SELECT * FROM users WHERE email=?').get(email);

    await updateUser(before.id, 'Kept Renamed', email, '', 'referee');

    const after = db.prepare('SELECT * FROM users WHERE id=?').get(before.id);
    expect(after.name).toBe('Kept Renamed');
    expect(after.password_hash).toBe(before.password_hash);
  });
});
