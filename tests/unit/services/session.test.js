import { describe, it, expect } from 'vitest';
import { getSessionIdleTimeoutMs } from '../../../src/services/session.service.js';

describe('getSessionIdleTimeoutMs', () => {
  it('defaults to 60 minutes when no env override is set', () => {
    expect(getSessionIdleTimeoutMs({})).toBe(60 * 60 * 1000);
  });

  it('uses SESSION_IDLE_TIMEOUT_MINUTES when set to a positive number', () => {
    expect(getSessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MINUTES: '15' })).toBe(15 * 60 * 1000);
  });

  it('falls back to the default for a non-numeric value', () => {
    expect(getSessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MINUTES: 'abc' })).toBe(60 * 60 * 1000);
  });

  it('falls back to the default for a non-positive value', () => {
    expect(getSessionIdleTimeoutMs({ SESSION_IDLE_TIMEOUT_MINUTES: '0' })).toBe(60 * 60 * 1000);
  });
});
