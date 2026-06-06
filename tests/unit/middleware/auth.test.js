import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requireAdmin, requireReferee } from '../../../src/middleware/auth.js';

function mockRes() {
  const res = {};
  res.redirect = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('requireAuth', () => {
  it('redirects to /login when no session user', () => {
    const req = { session: {} };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith('/login');
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user is in session', () => {
    const req = { session: { user: { id: 1, role: 'admin' } } };
    const res = mockRes();
    const next = vi.fn();
    requireAuth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });
});

describe('requireAdmin', () => {
  it('returns 403 when no session user', () => {
    const req = { session: {} };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user is a referee', () => {
    const req = { session: { user: { id: 1, role: 'referee' } } };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user is admin', () => {
    const req = { session: { user: { id: 1, role: 'admin' } } };
    const res = mockRes();
    const next = vi.fn();
    requireAdmin(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireReferee', () => {
  it('returns 403 when no session user', () => {
    const req = { session: {} };
    const res = mockRes();
    const next = vi.fn();
    requireReferee(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith('Forbidden');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for an unknown role', () => {
    const req = { session: { user: { id: 1, role: 'viewer' } } };
    const res = mockRes();
    const next = vi.fn();
    requireReferee(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user is referee', () => {
    const req = { session: { user: { id: 1, role: 'referee' } } };
    const res = mockRes();
    const next = vi.fn();
    requireReferee(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next when user is admin', () => {
    const req = { session: { user: { id: 1, role: 'admin' } } };
    const res = mockRes();
    const next = vi.fn();
    requireReferee(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
