import { describe, it, expect, beforeEach } from 'vitest';
import initAdmin from '../../src/init-admin.js';
import { db } from './services/testHelpers.js';

describe('initAdmin', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM users').run();
  });

  it('creates only the admin from the environment', async () => {
    const created = await initAdmin({ ADMIN_EMAIL: 'boss@example.com', ADMIN_PASSWORD: 'secret-pass', ADMIN_NAME: 'Boss' });

    expect(created).toBe(true);
    expect(db.prepare('SELECT name, role FROM users').all()).toEqual([{ name: 'Boss', role: 'admin' }]);
    expect(db.prepare('SELECT email FROM users').get().email).toBe('boss@example.com');
  });

  it('falls back to the default login', async () => {
    await initAdmin({});
    expect(db.prepare("SELECT id FROM users WHERE email='admin@example.com' AND role='admin'").get()).toBeDefined();
  });

  it('leaves an existing database alone', async () => {
    await initAdmin({ ADMIN_EMAIL: 'first@example.com', ADMIN_PASSWORD: 'one' });
    const before = db.prepare('SELECT * FROM users').all();

    const created = await initAdmin({ ADMIN_EMAIL: 'second@example.com', ADMIN_PASSWORD: 'two' });

    expect(created).toBe(false);
    expect(db.prepare('SELECT * FROM users').all()).toEqual(before);
  });
});
