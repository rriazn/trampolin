import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, seedTestUsers, getUserIdByEmail, db } from './helpers/createApp.js';

const app = createApp();

beforeAll(() => seedTestUsers());

function getUser(email) {
  return db.prepare('SELECT name, email FROM users WHERE id=?').get(getUserIdByEmail(email));
}

describe('password change invalidation', () => {
  it('logs out other sessions for a user whose password was changed elsewhere', async () => {
    const refereeAgent = request.agent(app);
    await refereeAgent.post('/login').type('form').send({ email: 'referee@test.com', password: 'secret123' });
    await refereeAgent.get('/referee').expect(200);

    const adminAgent = request.agent(app);
    await adminAgent.post('/login').type('form').send({ email: 'admin@test.com', password: 'secret123' });
    const refereeId = getUserIdByEmail('referee@test.com');
    const referee = getUser('referee@test.com');
    await adminAgent.post(`/admin/users/${refereeId}`).type('form')
      .send({ name: referee.name, email: referee.email, password: 'new-secret456', role: 'referee' });

    const res = await refereeAgent.get('/referee');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?reason=expired');
  });

  it('keeps the acting session alive when an admin changes their own password', async () => {
    const adminAgent = request.agent(app);
    await adminAgent.post('/login').type('form').send({ email: 'admin@test.com', password: 'secret123' });
    const adminId = getUserIdByEmail('admin@test.com');
    const admin = getUser('admin@test.com');

    await adminAgent.post(`/admin/users/${adminId}`).type('form')
      .send({ name: admin.name, email: admin.email, password: 'admin-new-secret', role: 'admin' });

    const res = await adminAgent.get('/admin');
    expect(res.status).toBe(200);
  });
});
