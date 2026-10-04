import { describe, it, expect } from 'vitest';

const request = require('supertest');
const { createApp } = require('./helpers/createApp');

const app = createApp();

describe('asset cache headers', () => {
  it('lets a versioned url be cached for a year', async () => {
    const res = await request(app).get('/style.css?v=abc');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('lets a versioned vendor file be cached for a year', async () => {
    const res = await request(app).get('/vendor/bootstrap/css/bootstrap.min.css?v=abc');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('does not treat an arbitrary query string as a version', async () => {
    const res = await request(app).get('/style.css?x=1');
    expect(res.headers['cache-control']).toBe('public, max-age=0');
  });

  it('lets a font url with the bootstrap-icons content hash be cached for a year', async () => {
    const res = await request(app).get('/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2?dd67030699838ea613ee6dbda90effa6');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('makes an unversioned stylesheet revalidate', async () => {
    const res = await request(app).get('/style.css');
    expect(res.headers['cache-control']).toBe('public, max-age=0');
    expect(res.headers.etag).toBeTruthy();
  });

  it('caches an unversioned font for a week', async () => {
    const res = await request(app).get('/vendor/inter/inter-latin-wght-normal.woff2');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=604800');
  });

  it('answers a revalidation with 304', async () => {
    const first = await request(app).get('/style.css');
    const second = await request(app).get('/style.css').set('If-None-Match', first.headers.etag);
    expect(second.status).toBe(304);
  });
});
