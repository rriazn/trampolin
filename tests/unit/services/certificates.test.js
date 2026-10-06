import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import i18next from 'i18next';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt, makeUser, assignJudge,
  addScore, getJudgeRoleIds, db, require,
} from './testHelpers.js';
const { groupReadiness, groupReadinessFor, buildCertificatesData, buildCertificateLabels } = require('../../../src/services/certificates.service.js');

const localesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/locales');
const NAMESPACES = ['common', 'certificates'];

// real i18next instance, the stub translator of the helpers cannot do ordinal plurals
function realT(lng) {
  const resources = Object.fromEntries(['en', 'de'].map(l => [l, Object.fromEntries(
    NAMESPACES.map(ns => [ns, JSON.parse(fs.readFileSync(path.join(localesDir, l, `${ns}.json`), 'utf8'))]))]));
  const instance = i18next.createInstance();
  instance.init({ lng, resources, ns: NAMESPACES, defaultNS: 'common', initImmediate: false, interpolation: { escapeValue: false } });
  return instance.getFixedT(lng);
}

const NOW = new Date(2026, 9, 3, 9, 5);
const groupRow = (id) => db.prepare('SELECT * FROM groups WHERE id=?').get(id);
const competitionRow = (id) => db.prepare('SELECT * FROM competitions WHERE id=?').get(id);

// head judge penalties only, so a lower penalty means a higher total
function setup({ panelKey = 'test', status = 'active', name, date = null } = {}) {
  const comp = makeCompetition({ panelKey, status, name });
  if (date) db.prepare('UPDATE competitions SET date=? WHERE id=?').run(date, comp.id);
  const group = makeGroup(comp.id, 'Open');
  const head = assignJudge(comp.id, getJudgeRoleIds().head_judge, makeUser('head_judge').id);
  const compete = (round, sportsman, startOrder, penalty) => {
    const entry = makeEntry(round.id, sportsman.id, startOrder);
    const attempt = makeAttempt(entry.id, 1, 0);
    addScore(attempt.id, head, getJudgeRoleIds().head_judge, penalty);
    db.prepare("UPDATE attempts SET status='scored' WHERE id=?").run(attempt.id);
  };
  return { comp: competitionRow(comp.id), group: groupRow(group.id), compete };
}

describe('groupReadiness', () => {
  const find = (comp, group) => groupReadiness(comp).find(g => g.id === group.id);

  it('is not ready without rounds', () => {
    const { comp, group } = setup();
    expect(find(comp, group)).toMatchObject({ ready: false, roundCount: 0, participantCount: 0, downloadable: false });
  });

  it('is not ready while a round is still running', () => {
    const { comp, group } = setup();
    makeRound(group.id, { order: 1, status: 'completed' });
    makeRound(group.id, { order: 2, status: 'in_progress' });
    expect(find(comp, group)).toMatchObject({ ready: false, roundCount: 2 });
  });

  it('is ready when all rounds are completed and counts the athletes of the group', () => {
    const { comp, group } = setup();
    makeRound(group.id, { order: 1, status: 'completed' });
    makeSportsman(comp.id, group.id, 'Anna');
    makeSportsman(comp.id, group.id, 'Berta');
    expect(find(comp, group)).toMatchObject({ name: 'Open', abbreviation: group.abbreviation, ready: true, participantCount: 2, downloadable: true });
  });

  it('is ready in a closed competition even without rounds, but not downloadable without participants', () => {
    const { comp, group } = setup({ status: 'closed' });
    expect(find(comp, group)).toMatchObject({ ready: true, participantCount: 0, downloadable: false });
  });

  it('gives the readiness of a single group the same as in the list', () => {
    const { comp, group } = setup();
    makeRound(group.id, { status: 'completed' });
    makeSportsman(comp.id, group.id, 'Anna');
    expect(groupReadinessFor(comp, group)).toEqual(find(comp, group));
  });

  it('counts both athletes of a synchro pair', () => {
    const { comp, group } = setup({ panelKey: 'test_synchro' });
    makeRound(group.id, { status: 'completed' });
    const pair = makeSportsman(comp.id, group.id, 'Anna');
    db.prepare("UPDATE sportsmen SET partner_name='Berta' WHERE id=?").run(pair.id);
    expect(find(comp, group).participantCount).toBe(2);
  });
});

describe('buildCertificatesData', () => {
  it('builds the skeleton with the formatted date and the labels', () => {
    const { comp, group } = setup({ name: 'City Open', date: '2026-10-02' });
    const en = buildCertificatesData(comp, group, realT('en'), 'en', NOW);
    expect(en).toMatchObject({
      version: 1,
      generatedAt: '2026-10-03 09:05',
      competition: { name: 'City Open', date: '2026-10-02' },
      group: { name: 'Open', abbreviation: group.abbreviation },
      certificates: [],
      labels: { title: 'Certificate', participation: 'for participating in' },
    });
    expect(en).not.toHaveProperty('image');
    const de = buildCertificatesData(comp, group, realT('de'), 'de', NOW);
    expect(de.competition.date).toBe('02.10.2026');
    expect(de.labels.title).toBe('Urkunde');
  });

  it('has no date when the competition has none', () => {
    const { comp, group } = setup();
    expect(buildCertificatesData(comp, group, realT('en'), 'en', NOW).competition.date).toBeNull();
  });

  it('orders by last round and rank, shares places and puts athletes without a total at the end', () => {
    const { comp, group, compete } = setup();
    const qualifying = makeRound(group.id, { name: 'Qualifying', order: 1 });
    const final = makeRound(group.id, { name: 'Final', order: 2 });
    const [a, b, c, d] = ['Anna', 'Berta', 'Clara', 'Dora', 'Eva'].map(name => makeSportsman(comp.id, group.id, name));
    db.prepare("UPDATE sportsmen SET club='Club B' WHERE id=?").run(b.id);
    compete(qualifying, a, 1, 0.1);
    compete(qualifying, b, 2, 0.2);
    compete(qualifying, c, 3, 0.2);
    compete(final, b, 1, 0.2);
    compete(final, c, 2, 0.2);
    // Dora has an entry but no score, Eva has no entry at all
    makeAttempt(makeEntry(qualifying.id, d.id, 4).id, 1);

    const data = buildCertificatesData(comp, group, realT('en'), 'en', NOW);
    expect(data.certificates.map(x => [x.name, x.place, x.placeText, x.score, x.round])).toEqual([
      ['Berta', 1, '1st place', '-0.2', 'Final'],
      ['Clara', 1, '1st place', '-0.2', 'Final'],
      ['Anna', 3, '3rd place', '-0.1', 'Qualifying'],
      ['Dora', null, null, null, null],
      ['Eva', null, null, null, null],
    ]);
    expect(data.certificates[0]).toMatchObject({ club: 'Club B', partner: null });
  });

  it('uses the score and the round of the last round the athlete has a row in', () => {
    const { comp, group, compete } = setup();
    const qualifying = makeRound(group.id, { name: 'Qualifying', order: 1 });
    makeRound(group.id, { name: 'Final', order: 2 });
    compete(qualifying, makeSportsman(comp.id, group.id, 'Anna'), 1, 0.3);
    const [only] = buildCertificatesData(comp, group, realT('en'), 'en', NOW).certificates;
    expect(only).toMatchObject({ score: '-0.3', round: 'Qualifying', place: 1 });
  });

  it('formats scores and ordinals for the language', () => {
    const { comp, group, compete } = setup();
    const round = makeRound(group.id, { name: 'Finale' });
    ['Anna', 'Berta', 'Clara', 'Dora'].forEach((name, i) => compete(round, makeSportsman(comp.id, group.id, name), i + 1, 0.1 * (i + 1)));
    const de = buildCertificatesData(comp, group, realT('de'), 'de', NOW).certificates;
    expect(de.map(x => x.placeText)).toEqual(['1. Platz', '2. Platz', '3. Platz', '4. Platz']);
    expect(de[1].score).toBe('-0,2');
    const en = buildCertificatesData(comp, group, realT('en'), 'en', NOW).certificates;
    expect(en.map(x => x.placeText)).toEqual(['1st place', '2nd place', '3rd place', '4th place']);
  });

  it('gives each athlete of a synchro pair a page naming themselves first', () => {
    const { comp, group, compete } = setup({ panelKey: 'test_synchro' });
    const round = makeRound(group.id, { name: 'Final' });
    const pair = makeSportsman(comp.id, group.id, 'Anna');
    db.prepare("UPDATE sportsmen SET club='Club A', partner_name='Berta', partner_club='Club B' WHERE id=?").run(pair.id);
    compete(round, pair, 1, 0.2);
    const solo = makeSportsman(comp.id, group.id, 'Clara');
    db.prepare("UPDATE sportsmen SET partner_name='Dora' WHERE id=?").run(solo.id);

    const { certificates } = buildCertificatesData(comp, group, realT('en'), 'en', NOW);
    expect(certificates).toEqual([
      { name: 'Anna', club: 'Club A', partner: { name: 'Berta', club: 'Club B' }, place: 1, placeText: '1st place', score: '-0.2', round: 'Final' },
      { name: 'Berta', club: 'Club B', partner: { name: 'Anna', club: 'Club A' }, place: 1, placeText: '1st place', score: '-0.2', round: 'Final' },
      { name: 'Clara', club: null, partner: { name: 'Dora', club: null }, place: null, placeText: null, score: null, round: null },
      { name: 'Dora', club: null, partner: { name: 'Clara', club: null }, place: null, placeText: null, score: null, round: null },
    ]);
  });
});

describe('buildCertificatesData for a pair moved to another group', () => {
  it('still gives both athletes a page when the pair has an entry in this group but now belongs to another', () => {
    const { comp, group, compete } = setup({ panelKey: 'test_synchro' });
    const round = makeRound(group.id, { name: 'Final' });
    const pair = makeSportsman(comp.id, group.id, 'Anna');
    db.prepare("UPDATE sportsmen SET partner_name='Berta' WHERE id=?").run(pair.id);
    compete(round, pair, 1, 0.2);
    const other = makeGroup(comp.id, 'Other');
    db.prepare('UPDATE sportsmen SET group_id=? WHERE id=?').run(other.id, pair.id);

    const { certificates } = buildCertificatesData(comp, group, realT('en'), 'en', NOW);
    expect(certificates.map(c => [c.name, c.partner && c.partner.name, c.place])).toEqual([['Anna', 'Berta', 1], ['Berta', 'Anna', 1]]);
  });
});

describe('buildCertificateLabels', () => {
  it('translates every fixed text except the ordinal place, which is built per certificate', () => {
    const labels = buildCertificateLabels(realT('de'));
    expect(labels).toMatchObject({ title: 'Urkunde', group: 'Gruppe', score: 'Punkte', round: 'Durchgang', with: 'gemeinsam mit' });
    expect(Object.values(buildCertificateLabels(realT('en'))).every(Boolean)).toBe(true);
  });
});

describe('sample-certificates.json', () => {
  // every key path of a document, arrays are flattened to [] and null values still count as a path
  function pathsOf(value, prefix = '', out = new Set()) {
    if (Array.isArray(value)) value.forEach(item => pathsOf(item, `${prefix}[]`, out));
    else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, item]) => pathsOf(item, `${prefix}.${key}`, out));
    else out.add(prefix);
    return out;
  }

  it('has exactly the fields the builder produces', () => {
    const { comp, group, compete } = setup({ date: '2026-10-03' });
    const round = makeRound(group.id);
    compete(round, makeSportsman(comp.id, group.id, 'Solo'), 1, 0.1);
    const pair = makeSportsman(comp.id, group.id, 'Anna');
    db.prepare("UPDATE sportsmen SET partner_name='Berta' WHERE id=?").run(pair.id);
    makeSportsman(comp.id, group.id, 'Unranked');

    const sample = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/templates/certificates/sample-certificates.json'), 'utf8'));
    const built = pathsOf(buildCertificatesData(comp, group, realT('en'), 'en', NOW));
    const sampled = pathsOf(sample);
    expect([...built].filter(p => !sampled.has(p)), 'missing from the sample').toEqual([]);
    expect([...sampled].filter(p => !built.has(p)), 'not produced by the builder').toEqual([]);
  });
});
