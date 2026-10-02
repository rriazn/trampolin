import { describe, it, expect } from 'vitest';
import { require } from './testHelpers.js';
const { competitorName, competitorClub } = require('../../../src/services/helpers/competitor.helpers.js');

describe('competitorName', () => {
  it('returns the single name for an individual', () => {
    expect(competitorName('Leon Weber', null)).toBe('Leon Weber');
    expect(competitorName('Leon Weber')).toBe('Leon Weber');
  });

  it('joins a pair as "A / B"', () => {
    expect(competitorName('Leon Weber', 'Emma Fischer')).toBe('Leon Weber / Emma Fischer');
  });

  it('ignores a blank partner', () => {
    expect(competitorName('Leon Weber', '  ')).toBe('Leon Weber');
  });
});

describe('competitorClub', () => {
  it('collapses to one club when both athletes share it', () => {
    expect(competitorClub('TSV München', 'TSV München')).toBe('TSV München');
  });

  it('joins two different clubs as "A / B"', () => {
    expect(competitorClub('TSV München', 'SV Hamburg')).toBe('TSV München / SV Hamburg');
  });

  it('returns whichever club is set when only one is', () => {
    expect(competitorClub('TSV München', null)).toBe('TSV München');
    expect(competitorClub(null, 'SV Hamburg')).toBe('SV Hamburg');
    expect(competitorClub('', 'SV Hamburg')).toBe('SV Hamburg');
  });

  it('returns null when neither has a club', () => {
    expect(competitorClub(null, null)).toBeNull();
    expect(competitorClub('', ' ')).toBeNull();
  });
});
