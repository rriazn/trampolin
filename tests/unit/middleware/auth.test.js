import { describe, it, expect, vi } from 'vitest';
import { requireAuth, requireAdmin, requireReferee, requireHeadJudge, checkSessionValidity, APP_EPOCH } from '../../../src/middleware/auth.js';
import { makeUser, db } from '../services/testHelpers.js';

function mockRes() {
  const res = {};
  res.redirect = vi.fn().mockReturnValue(res);
  res.status = vi.fn().mockReturnValue(res);
  res.render = vi.fn().mockReturnValue(res);
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
    expect(res.render).toHaveBeenCalledWith('errors/403');
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
    expect(res.render).toHaveBeenCalledWith('errors/403');
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

describe('requireHeadJudge', () => {
  it('returns 403 when no session user', () => {
    const req = { session: {} };
    const res = mockRes();
    const next = vi.fn();
    requireHeadJudge(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.render).toHaveBeenCalledWith('errors/403');
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 for a referee', () => {
    const req = { session: { user: { id: 1, role: 'referee' } } };
    const res = mockRes();
    const next = vi.fn();
    requireHeadJudge(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when user is head_judge', () => {
    const req = { session: { user: { id: 1, role: 'head_judge' } } };
    const res = mockRes();
    const next = vi.fn();
    requireHeadJudge(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls next when user is admin', () => {
    const req = { session: { user: { id: 1, role: 'admin' } } };
    const res = mockRes();
    const next = vi.fn();
    requireHeadJudge(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('checkSessionValidity', () => {
  it('calls next when there is no session user', () => {
    const req = { session: {} };
    const res = mockRes();
    const next = vi.fn();
    checkSessionValidity(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('calls next when the epoch and token version both match', () => {
    const user = makeUser();
    const req = { session: { user: { id: user.id }, epoch: APP_EPOCH, tokenVersion: 0 } };
    const res = mockRes();
    const next = vi.fn();
    checkSessionValidity(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('destroys the session and redirects to the expired login page when the epoch is stale', () => {
    const user = makeUser();
    const destroy = vi.fn((cb) => cb());
    const req = { session: { user: { id: user.id }, epoch: 'stale-epoch', tokenVersion: 0, destroy } };
    const res = mockRes();
    const next = vi.fn();
    checkSessionValidity(req, res, next);
    expect(destroy).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/login?reason=expired');
    expect(next).not.toHaveBeenCalled();
  });

  it('destroys the session and redirects to the expired login page when the token version is stale', () => {
    const user = makeUser();
    db.prepare('UPDATE users SET token_version = 1 WHERE id = ?').run(user.id);
    const destroy = vi.fn((cb) => cb());
    const req = { session: { user: { id: user.id }, epoch: APP_EPOCH, tokenVersion: 0, destroy } };
    const res = mockRes();
    const next = vi.fn();
    checkSessionValidity(req, res, next);
    expect(destroy).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith('/login?reason=expired');
    expect(next).not.toHaveBeenCalled();
  });
});
