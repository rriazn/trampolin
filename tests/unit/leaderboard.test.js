import { describe, it, expect } from 'vitest';
import { trimmedMean } from '../../src/routes/leaderboard.js';

describe('trimmedMean', () => {
  it('returns null for empty scores', () => {
    expect(trimmedMean([])).toBeNull();
  });

  it('returns the value for a single score', () => {
    expect(trimmedMean([7])).toBe(7);
  });

  it('returns average for two scores', () => {
    expect(trimmedMean([4, 6])).toBe(5);
  });

  it('drops min and max for three scores', () => {
    expect(trimmedMean([1, 5, 9])).toBe(5);
  });

  it('drops min and max for five scores', () => {
    expect(trimmedMean([1, 3, 5, 7, 9])).toBe(5);
  });

  it('handles all equal scores', () => {
    expect(trimmedMean([8, 8, 8, 8])).toBe(8);
  });

  it('handles decimal scores', () => {
    expect(trimmedMean([7.5, 8.0, 8.5])).toBeCloseTo(8.0);
  });

  it('is order-independent (unsorted input)', () => {
    expect(trimmedMean([9, 1, 5])).toBe(5);
  });
});
