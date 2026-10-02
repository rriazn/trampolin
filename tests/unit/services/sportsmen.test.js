import { describe, it, expect } from 'vitest';
import { require } from './testHelpers.js';
const { normalizeGender, parseSportsmanInput } = require('../../../src/services/sportsmen.service.js');

const individual = { type: 'individual' };
const synchro = { type: 'synchro' };

describe('normalizeGender', () => {
  it('keeps m and f, in any case', () => {
    expect(normalizeGender('m')).toBe('m');
    expect(normalizeGender('F')).toBe('f');
    expect(normalizeGender(' f ')).toBe('f');
  });

  it('turns anything else into null so the CHECK constraint cannot fail', () => {
    expect(normalizeGender('')).toBeNull();
    expect(normalizeGender('x')).toBeNull();
    expect(normalizeGender('male')).toBeNull();
    expect(normalizeGender(undefined)).toBeNull();
  });
});

describe('parseSportsmanInput for an individual competition', () => {
  it('requires a name', () => {
    expect(parseSportsmanInput({ name: ' ' }, individual)).toEqual({ error: 'nameRequired' });
  });

  it('normalizes the fields and leaves the partner empty even if partner fields are sent', () => {
    const { values } = parseSportsmanInput({
      name: ' Leon ', club: ' TSV ', gender: 'M', birth_year: '2008', routine: ' W11 ', group_id: '4',
      partner_name: 'Ignored', partner_club: 'Ignored',
    }, individual);

    expect(values).toEqual({
      name: 'Leon', club: 'TSV', gender: 'm', birth_year: 2008, routine: 'W11', group_id: 4,
      partner: { name: null, club: null, gender: null, birth_year: null },
    });
  });

  it('turns blank or invalid optional fields into null', () => {
    const { values } = parseSportsmanInput({ name: 'Leon', gender: 'x', birth_year: 'abc', group_id: '' }, individual);

    expect(values).toMatchObject({ club: null, gender: null, birth_year: null, routine: null, group_id: null });
  });
});

describe('parseSportsmanInput for a synchro competition', () => {
  it('requires the second athlete name as well', () => {
    expect(parseSportsmanInput({ name: 'Leon' }, synchro)).toEqual({ error: 'partnerNameRequired' });
    expect(parseSportsmanInput({ name: 'Leon', partner_name: '  ' }, synchro)).toEqual({ error: 'partnerNameRequired' });
  });

  it('still reports a missing first name first', () => {
    expect(parseSportsmanInput({ partner_name: 'Emma' }, synchro)).toEqual({ error: 'nameRequired' });
  });

  it('reads both athletes and the shared routine and group', () => {
    const { values } = parseSportsmanInput({
      name: 'Leon', club: 'TSV', gender: 'm', birth_year: '2008',
      partner_name: ' Emma ', partner_club: 'SV', partner_gender: 'F', partner_birth_year: '2009',
      routine: 'W11', group_id: '2',
    }, synchro);

    expect(values).toEqual({
      name: 'Leon', club: 'TSV', gender: 'm', birth_year: 2008, routine: 'W11', group_id: 2,
      partner: { name: 'Emma', club: 'SV', gender: 'f', birth_year: 2009 },
    });
  });
});
