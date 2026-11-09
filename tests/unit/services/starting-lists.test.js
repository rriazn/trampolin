import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import i18next from 'i18next';
import { makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeStartingGroup, db, require } from './testHelpers.js';
const {
  hasStartingLists, buildStartingListLabels, buildRoundStartingList, buildAllStartingLists,
} = require('../../../src/services/starting-lists.service.js');
const { compilePdf, readDefaultTemplate, readSampleData } = require('../../../src/services/pdf.service.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(here, '../../../src/locales');
const NAMESPACES = ['common', 'startingLists'];

function realT(lng) {
  const resources = Object.fromEntries(['en', 'de'].map(l => [l, Object.fromEntries(
    NAMESPACES.map(ns => [ns, JSON.parse(fs.readFileSync(path.join(localesDir, l, `${ns}.json`), 'utf8'))]))]));
  const instance = i18next.createInstance();
  instance.init({ lng, resources, ns: NAMESPACES, defaultNS: 'common', initImmediate: false, interpolation: { escapeValue: false } });
  return instance.getFixedT(lng);
}

const NOW = new Date(2026, 10, 7, 18, 30);
const groupRow = (id) => db.prepare('SELECT * FROM groups WHERE id=?').get(id);
const competitionRow = (id) => db.prepare('SELECT * FROM competitions WHERE id=?').get(id);

// an athlete with optional details, written straight into the row
function athlete(comp, group, name, fields = {}) {
  const sp = makeSportsman(comp.id, group.id, name);
  for (const [column, value] of Object.entries(fields)) db.prepare(`UPDATE sportsmen SET ${column}=? WHERE id=?`).run(value, sp.id);
  return sp;
}

function setup({ panelKey = 'test', date = null } = {}) {
  const comp = makeCompetition({ panelKey });
  if (date) db.prepare('UPDATE competitions SET date=? WHERE id=?').run(date, comp.id);
  return competitionRow(comp.id);
}

describe('buildRoundStartingList', () => {
  it('lists the competitors in start order with positions 1..n even when start_order has gaps', () => {
    const comp = setup({ date: '2026-10-02' });
    const group = groupRow(makeGroup(comp.id, 'Open').id);
    const round = makeRound(group.id, { name: 'Final' });
    makeEntry(round.id, athlete(comp, group, 'Carla').id, 7);
    makeEntry(round.id, athlete(comp, group, 'Anna', { club: 'TSV', birth_year: 2008, routine: 'W11' }).id, 2);
    makeEntry(round.id, athlete(comp, group, 'Berta').id, 4);

    const data = buildRoundStartingList(comp, group, round, realT('de'), 'de', NOW);
    expect(data).toMatchObject({
      version: 1,
      generatedAt: '07.11.2026 18:30',
      competition: { name: comp.name, date: '02.10.2026', type: 'individual' },
    });
    expect(data.rounds).toHaveLength(1);
    expect(data.rounds[0]).toMatchObject({ group: { name: 'Open', abbreviation: group.abbreviation }, round: { name: 'Final' }, startingGroup: null });
    expect(data.rounds[0].competitors).toEqual([
      { position: 1, name: 'Anna', club: 'TSV', birthYear: '2008', routine: 'W11', partner: null },
      { position: 2, name: 'Berta', club: null, birthYear: null, routine: null, partner: null },
      { position: 3, name: 'Carla', club: null, birthYear: null, routine: null, partner: null },
    ]);
  });

  it('fills the partner of a synchro pair', () => {
    const comp = setup({ panelKey: 'test_synchro' });
    const group = groupRow(makeGroup(comp.id).id);
    const round = makeRound(group.id);
    makeEntry(round.id, athlete(comp, group, 'Leon', { partner_name: 'Emma', partner_club: 'SV', partner_birth_year: 2009 }).id, 1);

    const [competitor] = buildRoundStartingList(comp, group, round, realT('en'), 'en', NOW).rounds[0].competitors;
    expect(competitor.partner).toEqual({ name: 'Emma', club: 'SV', birthYear: '2009' });
  });

  it('names the starting group of a member round', () => {
    const comp = setup();
    const a = makeGroup(comp.id, 'A');
    const b = makeGroup(comp.id, 'B');
    makeStartingGroup(comp.id, [a.id, b.id], 'Start 1');
    const group = groupRow(a.id);
    const round = makeRound(group.id);
    expect(buildRoundStartingList(comp, group, round, realT('en'), 'en', NOW).rounds[0].startingGroup).toBe('Start 1');
  });
});

describe('buildAllStartingLists', () => {
  it('goes group by group in name order, rounds in round order, and skips rounds without entries', () => {
    const comp = setup();
    const zulu = groupRow(makeGroup(comp.id, 'Zulu').id);
    const alpha = groupRow(makeGroup(comp.id, 'Alpha').id);
    const zFinal = makeRound(zulu.id, { name: 'Z Final', order: 2 });
    const zQuali = makeRound(zulu.id, { name: 'Z Quali', order: 1 });
    makeRound(alpha.id, { name: 'A Empty', order: 1 });
    const aFinal = makeRound(alpha.id, { name: 'A Final', order: 2 });
    for (const round of [zFinal, zQuali]) makeEntry(round.id, athlete(comp, zulu, `Z ${round.name}`).id, 1);
    makeEntry(aFinal.id, athlete(comp, alpha, 'A one').id, 1);

    const data = buildAllStartingLists(comp, realT('en'), 'en', NOW);
    expect(data.rounds.map(r => `${r.group.name}/${r.round.name}`)).toEqual(['Alpha/A Final', 'Zulu/Z Quali', 'Zulu/Z Final']);
  });

  it('has no rounds when nothing has entries', () => {
    const comp = setup();
    makeRound(makeGroup(comp.id).id);
    expect(buildAllStartingLists(comp, realT('en'), 'en', NOW).rounds).toEqual([]);
  });
});

describe('hasStartingLists', () => {
  it('is true only when a round of the competition has entries', () => {
    const comp = setup();
    const group = groupRow(makeGroup(comp.id, 'Open').id);
    const round = makeRound(group.id);
    expect(hasStartingLists(comp)).toBe(false);
    makeEntry(round.id, athlete(comp, group, 'Anna').id, 1);
    expect(hasStartingLists(comp)).toBe(true);
    expect(hasStartingLists(setup())).toBe(false);
  });
});

describe('buildStartingListLabels', () => {
  it('translates every label in both languages', () => {
    expect(buildStartingListLabels(realT('de'))).toMatchObject({ title: 'Startliste', startingGroup: 'Startgruppe', birthYear: 'Jahrgang', routine: 'Übung' });
    for (const lng of ['en', 'de']) {
      const labels = buildStartingListLabels(realT(lng));
      expect(Object.keys(labels)).toEqual(['title', 'group', 'round', 'startingGroup', 'position', 'name', 'club', 'birthYear', 'routine']);
      expect(Object.values(labels).every(v => v && !v.startsWith('labels.'))).toBe(true);
    }
  });
});

describe('sample-starting-lists.json', () => {
  // every key path of a document, arrays are flattened to [] and null values still count as a path
  function pathsOf(value, prefix = '', out = new Set()) {
    if (Array.isArray(value)) value.forEach(item => pathsOf(item, `${prefix}[]`, out));
    else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, item]) => pathsOf(item, `${prefix}.${key}`, out));
    else out.add(prefix);
    return out;
  }

  it('has exactly the fields the builder produces', () => {
    const comp = setup({ date: '2026-10-02' });
    const a = makeGroup(comp.id, 'A');
    makeStartingGroup(comp.id, [a.id, makeGroup(comp.id, 'B').id], 'Start 1');
    const group = groupRow(a.id);
    const round = makeRound(group.id);
    makeEntry(round.id, athlete(comp, group, 'Solo').id, 1);
    makeEntry(round.id, athlete(comp, group, 'Leon', { partner_name: 'Emma' }).id, 2);

    const built = pathsOf(buildRoundStartingList(comp, group, round, realT('en'), 'en', NOW));
    const sampled = pathsOf(readSampleData('starting-lists'));
    expect([...built].filter(p => !sampled.has(p)), 'missing from the sample').toEqual([]);
    expect([...sampled].filter(p => !built.has(p)), 'not produced by the builder').toEqual([]);
  });
});

describe('default starting lists template', () => {
  it('compiles with the sample data', async () => {
    const pdf = await compilePdf(readDefaultTemplate('starting-lists'), readSampleData('starting-lists'), realT('en'), { dataFile: 'starting-lists.json' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
