import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from './helpers/createApp.js';

const app = createApp();

describe('POST /language/:lng', () => {
  it('sets the session language and redirects to a safe relative "from" path', async () => {
    const agent = request.agent(app);
    const res = await agent.post('/language/de').type('form').send({ from: '/login' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');

    const page = await agent.get('/login');
    expect(page.text).toContain('Passwort');
  });

  it('falls back to "/" when "from" is missing', async () => {
    const res = await request(app).post('/language/de').type('form').send({});
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('falls back to "/" for a protocol-relative "from" (open-redirect guard)', async () => {
    const res = await request(app).post('/language/en').type('form').send({ from: '//evil.com' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('falls back to "/" for an absolute "from" URL', async () => {
    const res = await request(app).post('/language/en').type('form').send({ from: 'http://evil.com' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('ignores an unsupported language code (session language is left unchanged)', async () => {
    const agent = request.agent(app);
    await agent.post('/language/de').type('form').send({ from: '/login' });

    const res = await agent.post('/language/fr').type('form').send({ from: '/login' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');

    const page = await agent.get('/login');
    expect(page.text).toContain('Passwort');
  });

  it('persists the chosen language across subsequent requests in the same session', async () => {
    const agent = request.agent(app);
    await agent.post('/language/de').type('form').send({ from: '/login' });

    const first = await agent.get('/login');
    const second = await agent.get('/login');
    expect(first.text).toContain('Einloggen');
    expect(second.text).toContain('Einloggen');
  });
});
