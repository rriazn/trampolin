import { describe, it, expect } from 'vitest';
import {
  makeCompetition, makeSportsman, makeUser, getJudgeRoleIds, assignJudge, getPanelTemplateId, db, require,
} from './testHelpers.js';
const { validateCompetitionInput, canChangeCompetitionType } = require('../../../src/services/competitions.service.js');

const figId = () => getPanelTemplateId('fig');
const figSynchroId = () => getPanelTemplateId('fig_synchro');

describe('canChangeCompetitionType', () => {
  it('is true for an empty competition', () => {
    const comp = makeCompetition({ panelKey: null });
    expect(canChangeCompetitionType(comp.id)).toBe(true);
  });

  it('is false once the competition has a sportsman', () => {
    const comp = makeCompetition({ panelKey: null });
    makeSportsman(comp.id, null);
    expect(canChangeCompetitionType(comp.id)).toBe(false);
  });

  it('is false once a judge is assigned', () => {
    const comp = makeCompetition({ panelKey: 'fig' });
    assignJudge(comp.id, getJudgeRoleIds().execution, makeUser('referee').id);
    expect(canChangeCompetitionType(comp.id)).toBe(false);
  });
});

describe('validateCompetitionInput for a new competition', () => {
  it('requires a name', () => {
    expect(validateCompetitionInput({ name: '  ', type: 'individual' })).toEqual({ error: 'nameRequired' });
    expect(validateCompetitionInput({ type: 'individual' })).toEqual({ error: 'nameRequired' });
  });

  it('defaults the type to individual when none is sent', () => {
    expect(validateCompetitionInput({ name: ' Cup ' }).values).toEqual({ name: 'Cup', type: 'individual', panelTemplateId: null });
  });

  it('accepts both known types', () => {
    expect(validateCompetitionInput({ name: 'A', type: 'individual' }).values.type).toBe('individual');
    expect(validateCompetitionInput({ name: 'A', type: 'synchro' }).values.type).toBe('synchro');
  });

  it('rejects an unknown or empty type', () => {
    expect(validateCompetitionInput({ name: 'A', type: 'team' })).toEqual({ error: 'typeInvalid' });
    expect(validateCompetitionInput({ name: 'A', type: '' })).toEqual({ error: 'typeInvalid' });
  });

  it('accepts a panel template that matches the type, given as the form string', () => {
    const individual = validateCompetitionInput({ name: 'A', type: 'individual', panelTemplateId: String(figId()) });
    const synchro = validateCompetitionInput({ name: 'A', type: 'synchro', panelTemplateId: String(figSynchroId()) });
    expect(individual.values.panelTemplateId).toBe(figId());
    expect(synchro.values.panelTemplateId).toBe(figSynchroId());
  });

  it('rejects a panel template of the other type', () => {
    expect(validateCompetitionInput({ name: 'A', type: 'synchro', panelTemplateId: String(figId()) })).toEqual({ error: 'panelTypeMismatch' });
    expect(validateCompetitionInput({ name: 'A', type: 'individual', panelTemplateId: String(figSynchroId()) })).toEqual({ error: 'panelTypeMismatch' });
  });

  it('rejects a panel template that does not exist', () => {
    expect(validateCompetitionInput({ name: 'A', type: 'individual', panelTemplateId: '999999' })).toEqual({ error: 'panelTypeMismatch' });
  });

  it('treats an empty panel template as none', () => {
    expect(validateCompetitionInput({ name: 'A', type: 'synchro', panelTemplateId: '' }).values.panelTemplateId).toBeNull();
  });
});

describe('validateCompetitionInput for an existing competition', () => {
  it('keeps the current type when none is sent, as a disabled select does not submit', () => {
    const comp = db.prepare("INSERT INTO competitions (name, type) VALUES ('Pairs', 'synchro')").run();
    const existing = db.prepare('SELECT * FROM competitions WHERE id=?').get(comp.lastInsertRowid);
    makeSportsman(existing.id, null);

    expect(validateCompetitionInput({ name: 'Pairs 2' }, existing).values.type).toBe('synchro');
  });

  it('allows a type change while the competition is empty', () => {
    const existing = makeCompetition({ panelKey: null });
    expect(validateCompetitionInput({ name: 'A', type: 'synchro' }, existing).values.type).toBe('synchro');
  });

  it('blocks a type change once the competition has sportsmen', () => {
    const existing = makeCompetition({ panelKey: null });
    makeSportsman(existing.id, null);
    expect(validateCompetitionInput({ name: 'A', type: 'synchro' }, existing)).toEqual({ error: 'typeLocked' });
  });

  it('still allows saving with the unchanged type once sportsmen exist', () => {
    const existing = makeCompetition({ panelKey: null });
    makeSportsman(existing.id, null);
    expect(validateCompetitionInput({ name: 'Renamed', type: 'individual' }, existing).values.type).toBe('individual');
  });

  it('rejects a type change that leaves the old panel template selected', () => {
    const existing = makeCompetition({ panelKey: 'fig' });
    expect(validateCompetitionInput({ name: 'A', type: 'synchro', panelTemplateId: String(figId()) }, existing)).toEqual({ error: 'panelTypeMismatch' });
  });
});
