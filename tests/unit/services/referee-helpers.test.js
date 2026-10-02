import { describe, it, expect } from 'vitest';
import { require } from './testHelpers.js';
const { isWithinRange, rangeErrorMessage, scoreStep, scoreDecimals, maxScoreFor } = require('../../../src/services/helpers/referee.helpers.js');

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

const templates = {
  'referee:rangeError.max': 'Score must be between {{min}} and {{max}}.',
  'referee:rangeError.min': 'Score must be at least {{min}}.',
};
const t = (key, vars = {}) => templates[key].replace(/{{(\w+)}}/g, (_, name) => vars[name]);

describe('rangeErrorMessage', () => {
  it('mentions both bounds when score_max is set', () => {
    expect(rangeErrorMessage({ score_min: 0, score_max: 10 }, t)).toBe('Score must be between 0 and 10.');
  });

  it('mentions only the minimum when score_max is null', () => {
    expect(rangeErrorMessage({ score_min: 2, score_max: null }, t)).toBe('Score must be at least 2.');
  });
});

describe('scoreStep', () => {
  it('uses hundredths for the synchronisation device mark (FIG 17.2.1)', () => {
    expect(scoreStep('synchronisation')).toBe(0.01);
  });

  it('uses tenths for every other attempt role', () => {
    for (const key of ['time_of_flight', 'horizontal_displacement', 'head_judge']) {
      expect(scoreStep(key)).toBe(0.1);
    }
  });
});

describe('scoreDecimals', () => {
  it('follows the step of the role', () => {
    expect(scoreDecimals('synchronisation')).toBe(2);
    expect(scoreDecimals('time_of_flight')).toBe(1);
  });
});

describe('maxScoreFor', () => {
  it('caps the synchronisation device mark at the number of valid elements (FIG 19.7)', () => {
    expect(maxScoreFor('synchronisation', 10, 6)).toBe(6);
    expect(maxScoreFor('synchronisation', 10, 1)).toBe(1);
  });

  it('caps the horizontal displacement mark the same way (FIG 17.2.4.2)', () => {
    expect(maxScoreFor('horizontal_displacement', 10, 6)).toBe(6);
    expect(maxScoreFor('horizontal_displacement', 10, 10)).toBe(10);
    expect(maxScoreFor('horizontal_displacement', 10, 12)).toBe(10);
  });

  it('keeps the role maximum for a full routine', () => {
    expect(maxScoreFor('synchronisation', 10, 10)).toBe(10);
  });

  it('never raises the role maximum', () => {
    expect(maxScoreFor('synchronisation', 10, 12)).toBe(10);
  });

  it('leaves other attempt roles on their own maximum', () => {
    expect(maxScoreFor('time_of_flight', 10, 6)).toBe(10);
    expect(maxScoreFor('head_judge', 10, 6)).toBe(10);
  });

  it('keeps an unbounded role unbounded', () => {
    expect(maxScoreFor('time_of_flight', null, 6)).toBeNull();
  });
});
