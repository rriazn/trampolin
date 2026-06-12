import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp, seedTestUsers } from './helpers/createApp.js';

const app = createApp();

beforeAll(() => seedTestUsers());

describe('GET /login', () => {
  it('returns 200 with the login form', async () => {
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/login"');
  });

  it('redirects to / when already logged in', async () => {
    const agent = request.agent(app);
    await agent.post('/login').type('form').send({ email: 'admin@test.com', password: 'secret123' });
    const res = await agent.get('/login');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

describe('POST /login', () => {
  it('shows error for unknown email', async () => {
    const res = await request(app)
      .post('/login').type('form')
      .send({ email: 'nobody@test.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password');
  });

  it('shows error for wrong password', async () => {
    const res = await request(app)
      .post('/login').type('form')
      .send({ email: 'admin@test.com', password: 'wrongpassword' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Invalid email or password');
  });

  it('redirects admin to /admin on success', async () => {
    const res = await request(app)
      .post('/login').type('form')
      .send({ email: 'admin@test.com', password: 'secret123' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/admin');
  });

  it('redirects referee to /referee on success', async () => {
    const res = await request(app)
      .post('/login').type('form')
      .send({ email: 'referee@test.com', password: 'secret123' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/referee');
  });
});

describe('POST /logout', () => {
  it('redirects to /login', async () => {
    const res = await request(app).post('/logout');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('clears the session so / redirects to /login afterward', async () => {
    const agent = request.agent(app);
    await agent.post('/login').type('form').send({ email: 'admin@test.com', password: 'secret123' });
    await agent.post('/logout');
    const res = await agent.get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});
