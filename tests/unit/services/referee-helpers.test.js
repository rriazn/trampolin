import { describe, it, expect } from 'vitest';
import { require } from './testHelpers.js';
const { isWithinRange, rangeErrorMessage } = require('../../../src/services/referee-helpers.js');

describe('isWithinRange', () => {
  it('accepts a value within min and max', () => {
    expect(isWithinRange(5, { score_min: 0, score_max: 10 })).toBe(true);
  });

  it('rejects a value below the minimum', () => {
    expect(isWithinRange(-1, { score_min: 0, score_max: 10 })).toBe(false);
  });

  it('rejects a value above the maximum', () => {
    expect(isWithinRange(11, { score_min: 0, score_max: 10 })).toBe(false);
  });

  it('accepts values at the exact boundaries', () => {
    expect(isWithinRange(0, { score_min: 0, score_max: 10 })).toBe(true);
    expect(isWithinRange(10, { score_min: 0, score_max: 10 })).toBe(true);
  });

  it('has no upper bound when score_max is null', () => {
    expect(isWithinRange(1000, { score_min: 0, score_max: null })).toBe(true);
  });
});

describe('rangeErrorMessage', () => {
  it('mentions both bounds when score_max is set', () => {
    expect(rangeErrorMessage({ score_min: 0, score_max: 10 })).toBe('Score must be between 0 and 10.');
  });

  it('mentions only the minimum when score_max is null', () => {
    expect(rangeErrorMessage({ score_min: 2, score_max: null })).toBe('Score must be at least 2.');
  });
});
