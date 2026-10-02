import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  makeCompetition, makeGroup, makeRound, makeSportsman, makeEntry, makeAttempt, makeUser, assignJudge,
  addScore, addElementScore, getJudgeRoleIds, makeT, db, require,
} from './testHelpers.js';
const { formatScore, buildJudgeIndex, buildResultsData, ROLE_LETTERS } = require('../../../src/services/results.service.js');

function assignMany(comp, roleKey, names) {
  const roleId = getJudgeRoleIds()[roleKey];
  return names.map((name) => assignJudge(comp.id, roleId, makeUser('referee', name).id));
}

describe('formatScore', () => {
  it('uses the decimal separator of the language', () => {
    expect(formatScore(15.7, 'de')).toBe('15,7');
    expect(formatScore(15.7, 'en')).toBe('15.7');
  });

  it('shows between one and three fraction digits', () => {
    expect(formatScore(5, 'en')).toBe('5.0');
    expect(formatScore(46.23, 'de')).toBe('46,23');
    expect(formatScore(15.2345, 'en')).toBe('15.235');
  });

  it('removes floating point noise', () => {
    expect(formatScore(0.1 + 0.2, 'en')).toBe('0.3');
  });

  it('keeps the sign of negative values and never prints negative zero', () => {
    expect(formatScore(-0.3, 'de')).toBe('-0,3');
    expect(formatScore(-0, 'en')).toBe('0.0');
    expect(formatScore(-0.0004, 'en')).toBe('0.0');
  });

  it('returns null for a missing value', () => {
    expect(formatScore(null, 'en')).toBeNull();
    expect(formatScore(undefined, 'en')).toBeNull();
  });
});

describe('ROLE_LETTERS', () => {
  it('has a letter for every seeded judge role', () => {
    for (const { key } of db.prepare('SELECT key FROM judge_roles').all()) {
      expect(ROLE_LETTERS[key], `ROLE_LETTERS.${key}`).toBeTruthy();
    }
  });
});

describe('buildJudgeIndex', () => {
  function setupFigSynchro() {
    const comp = makeCompetition({ panelKey: 'fig_synchro' });
    const t1 = assignMany(comp, 'execution_t1', ['Berta', 'Anna', 'Clara']);
    const t2 = assignMany(comp, 'execution_t2', ['Dora', 'Eva', 'Frieda']);
    const [difficulty] = assignMany(comp, 'difficulty', ['Gerd']);
    const hdUser = makeUser('referee', 'Hans');
    const hd = assignJudge(comp.id, getJudgeRoleIds().horizontal_displacement, hdUser.id);
    const sync = assignJudge(comp.id, getJudgeRoleIds().synchronisation, hdUser.id);
    const [head] = assignMany(comp, 'head_judge', ['Ida']);
    return { comp, t1, t2, difficulty, hd, sync, head };
  }

  it('numbers judges per role letter in panel order, continuing across both trampolines', () => {
    const { comp, t1, t2, difficulty, hd, sync, head } = setupFigSynchro();
    const { labelByAssignment } = buildJudgeIndex(comp, makeT('en'));
    const label = (id) => labelByAssignment.get(id).label;
    // sorted by name within a role: Anna, Berta, Clara
    expect(t1.map(label)).toEqual(['E2', 'E1', 'E3']);
    expect(t2.map(label)).toEqual(['E4', 'E5', 'E6']);
    expect([difficulty, hd, sync, head].map(label)).toEqual(['D1', 'H1', 'S1', 'P1']);
  });

  it('lists every judge once on the judges page and puts a shared assignment on one line', () => {
    const { comp } = setupFigSynchro();
    const { judges } = buildJudgeIndex(comp, makeT('en'));
    expect(judges.map(j => j.label)).toEqual([
      'Execution Trampoline 1', 'Execution Trampoline 2', 'Difficulty',
      'Horizontal Displacement & Synchronisation', 'Head Judge (Penalties)',
    ]);
    expect(judges[0].members).toEqual([
      { label: 'E1', name: 'Anna' }, { label: 'E2', name: 'Berta' }, { label: 'E3', name: 'Clara' },
    ]);
    expect(judges[3].members).toEqual([{ label: 'H1 / S1', name: 'Hans' }]);
  });
});

// scores one attempt: elementValues maps an assignment id to its per element values, headJudge is [assignmentId, score]
function scoreAttempt(entryId, attemptNumber, { elementCount, roleId, elementValues, headJudge }) {
  const attempt = makeAttempt(entryId, attemptNumber, elementCount);
  for (const [assignmentId, values] of Object.entries(elementValues)) {
    values.forEach((value, i) => addElementScore(attempt.id, Number(assignmentId), roleId(assignmentId), i + 1, value));
  }
  if (headJudge) addScore(attempt.id, headJudge[0], getJudgeRoleIds().head_judge, headJudge[1]);
  db.prepare("UPDATE attempts SET status='scored' WHERE id=?").run(attempt.id);
  return attempt;
}

describe('buildResultsData', () => {
  const NOW = new Date(2026, 9, 2, 14, 3);

  it('builds the document skeleton from the competition', () => {
    const comp = makeCompetition({ panelKey: 'local', name: 'City Open' });
    db.prepare("UPDATE competitions SET date='2026-10-02' WHERE id=?").run(comp.id);
    const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(comp.id);
    const data = buildResultsData(competition, makeT('en'), 'en', NOW);
    expect(data).toMatchObject({
      version: 1,
      generatedAt: '2026-10-02 14:03',
      competition: { name: 'City Open', date: '2026-10-02', type: 'individual' },
      labels: { title: 'Results', place: 'Place', total: 'Total' },
    });
    expect(buildResultsData(competition, makeT('de'), 'de', NOW).generatedAt).toBe('02.10.2026 14:03');
  });

  it('builds a per judge execution row with dropped values, a difficulty row and the summary line', () => {
    const comp = makeCompetition({ panelKey: 'local', name: 'Local Cup' });
    const group = makeGroup(comp.id, 'Group A');
    const round = makeRound(group.id, { name: 'Compulsory', scoringMode: 'sum' });
    const sportsman = makeSportsman(comp.id, group.id, 'Athlete A');
    const entry = makeEntry(round.id, sportsman.id, 1);
    const roleIds = getJudgeRoleIds();
    const [anna, berta, clara, dora] = ['Anna', 'Berta', 'Clara', 'Dora']
      .map(name => assignJudge(comp.id, roleIds.execution, makeUser('referee', name).id));
    const difficulty = assignJudge(comp.id, roleIds.difficulty, makeUser('referee', 'Gerd').id);
    const head = assignJudge(comp.id, roleIds.head_judge, makeUser('head_judge', 'Ida').id);
    const roleOf = { [anna]: roleIds.execution, [berta]: roleIds.execution, [clara]: roleIds.execution, [dora]: roleIds.execution, [difficulty]: roleIds.difficulty };
    scoreAttempt(entry.id, 1, {
      elementCount: 2,
      roleId: (id) => roleOf[id],
      elementValues: { [anna]: [0.1, 0.1], [berta]: [0.2, 0.1], [clara]: [0, 0.1], [dora]: [0.3, 0.3], [difficulty]: [0.5, 0.6] },
      headJudge: [head, 0.3],
    });

    const data = buildResultsData(comp, makeT('en'), 'en', NOW);

    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]).toMatchObject({ name: 'Group A' });
    const [competitor] = data.groups[0].competitors;
    expect(competitor).toMatchObject({ place: 1, name: 'Athlete A', club: null });
    const [r] = competitor.rounds;
    expect(r).toMatchObject({ name: 'Compulsory', scoringMode: 'sum', total: '4.3', rank: 1 });
    expect(r.attempts[0]).toEqual({
      number: 1,
      status: 'scored',
      elementCount: 2,
      rows: [
        {
          kind: 'judges', roleKey: 'execution', label: 'E', total: '3.5',
          judges: [
            { label: 'E1', value: '1.8', dropped: false },
            { label: 'E2', value: '1.7', dropped: false },
            { label: 'E3', value: '1.9', dropped: true },
            { label: 'E4', value: '1.4', dropped: true },
          ],
        },
        { kind: 'tricks', roleKey: 'difficulty', label: 'D', tricks: ['0.5', '0.6'], landing: null, bonus: null, missingSkill: null, total: '1.1' },
      ],
      summary: [
        { roleKey: 'execution', label: 'E', value: '3.5' },
        { roleKey: 'difficulty', label: 'D', value: '1.1' },
        { roleKey: 'head_judge', label: 'P', value: '-0.3' },
      ],
      final: '4.3',
    });
    expect(data.judges.map(j => j.label)).toEqual(['Execution', 'Difficulty', 'Head Judge (Penalties)']);
  });
});

describe('buildResultsData placement', () => {
  // head judge penalties only, so a lower penalty means a higher total
  function setupHeadOnly() {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id, 'Open');
    const head = assignJudge(comp.id, getJudgeRoleIds().head_judge, makeUser('head_judge').id);
    const compete = (round, sportsman, startOrder, penalty) => {
      const entry = makeEntry(round.id, sportsman.id, startOrder);
      const attempt = makeAttempt(entry.id, 1, 0);
      addScore(attempt.id, head, getJudgeRoleIds().head_judge, penalty);
      db.prepare("UPDATE attempts SET status='scored' WHERE id=?").run(attempt.id);
    };
    return { comp, group, compete };
  }
  const placesOf = (data) => data.groups[0].competitors.map(c => [c.place, c.name]);

  it('puts finalists first by final placement, then the competitors eliminated earlier', () => {
    const { comp, group, compete } = setupHeadOnly();
    const qualifying = makeRound(group.id, { name: 'Qualifying', order: 1 });
    const final = makeRound(group.id, { name: 'Final', order: 2 });
    const [a, b, c] = ['Anna', 'Berta', 'Clara'].map(name => makeSportsman(comp.id, group.id, name));
    compete(qualifying, a, 1, 0.1); // best in qualifying but not in the final
    compete(qualifying, b, 2, 0.2);
    compete(qualifying, c, 3, 0.3);
    compete(final, b, 1, 0.5);
    compete(final, c, 2, 0.4);

    const data = buildResultsData(comp, makeT('en'), 'en');
    expect(placesOf(data)).toEqual([[1, 'Clara'], [2, 'Berta'], [3, 'Anna']]);
    expect(data.groups[0].competitors.map(x => x.rounds.map(r => r.name))).toEqual([
      ['Qualifying', 'Final'], ['Qualifying', 'Final'], ['Qualifying'],
    ]);
  });

  it('gives equal totals in the same last round the same place and skips the next one', () => {
    const { comp, group, compete } = setupHeadOnly();
    const round = makeRound(group.id, { name: 'Only round' });
    const [a, b, c] = ['Anna', 'Berta', 'Clara'].map(name => makeSportsman(comp.id, group.id, name));
    compete(round, a, 1, 0.2);
    compete(round, b, 2, 0.2);
    compete(round, c, 3, 0.5);

    expect(placesOf(buildResultsData(comp, makeT('en'), 'en'))).toEqual([[1, 'Anna'], [1, 'Berta'], [3, 'Clara']]);
  });

  it('shows empty trick cells for an attempt without skills', () => {
    const { comp, group, compete } = setupHeadOnly();
    compete(makeRound(group.id), makeSportsman(comp.id, group.id, 'Anna'), 1, 0.2);
    const [row] = buildResultsData(comp, makeT('en'), 'en').groups[0].competitors[0].rounds[0].attempts[0].rows;
    expect(row).toMatchObject({ kind: 'tricks', roleKey: 'execution', tricks: [], landing: null, total: '0.0' });
  });
});

describe('buildResultsData rows per panel', () => {
  // assigns users to the given roles and returns the assignment ids by role key, plus the role of each assignment
  function staff(comp, spec) {
    const roleIds = getJudgeRoleIds();
    const assignments = {};
    const roleOf = {};
    for (const [roleKey, names] of Object.entries(spec)) {
      assignments[roleKey] = names.map(name => {
        const id = assignJudge(comp.id, roleIds[roleKey], makeUser(roleKey === 'head_judge' ? 'head_judge' : 'referee', name).id);
        roleOf[id] = roleIds[roleKey];
        return id;
      });
    }
    return { assignments, roleId: (id) => roleOf[id] };
  }
  const attemptsOf = (data) => data.groups[0].competitors[0].rounds[0].attempts;

  it('merges the two trampolines into one E entry and gives per skill synchronisation its own row', () => {
    const comp = makeCompetition({ panelKey: 'local_synchro' });
    const group = makeGroup(comp.id);
    const round = makeRound(group.id, { scoringMode: 'sum' });
    const entry = makeEntry(round.id, makeSportsman(comp.id, group.id, 'Pair A').id, 1);
    const { assignments: a, roleId } = staff(comp, {
      execution_t1: ['Anna', 'Berta'], execution_t2: ['Clara', 'Dora'], difficulty: ['Gerd'], synchronisation_skill: ['Hans'], head_judge: ['Ida'],
    });
    scoreAttempt(entry.id, 1, {
      elementCount: 2,
      roleId,
      elementValues: {
        [a.execution_t1[0]]: [0.1, 0.2], [a.execution_t1[1]]: [0.3, 0.2],
        [a.execution_t2[0]]: [0.1, 0.1], [a.execution_t2[1]]: [0.1, 0.1],
        [a.difficulty[0]]: [0.5, 0.5], [a.synchronisation_skill[0]]: [0.1, 0],
      },
      headJudge: [a.head_judge[0], 0.2],
    });

    const [attempt] = attemptsOf(buildResultsData(comp, makeT('en'), 'en'));
    expect(attempt.rows.map(r => [r.roleKey, r.label, r.tricks, r.total])).toEqual([
      ['execution_t1', 'E', ['0.2', '0.2'], '0.8'],
      ['execution_t2', 'E', ['0.1', '0.1'], '0.9'],
      ['difficulty', 'D', ['0.5', '0.5'], '1.0'],
      ['synchronisation_skill', 'S', ['0.1', '0.0'], '3.8'],
    ]);
    expect(attempt.summary.map(x => [x.label, x.value])).toEqual([['E', '1.7'], ['D', '1.0'], ['S', '3.8'], ['P', '-0.2']]);
    expect(attempt.final).toBe('6.3');
  });

  it('shows the synchronisation device mark only as a final value', () => {
    const comp = makeCompetition({ panelKey: 'test_synchro' });
    const group = makeGroup(comp.id);
    const entry = makeEntry(makeRound(group.id).id, makeSportsman(comp.id, group.id, 'Pair B').id, 1);
    const { assignments: a, roleId } = staff(comp, {
      execution_t1: ['Anna'], execution_t2: ['Clara'], difficulty: ['Gerd'], synchronisation: ['Hans'], head_judge: ['Ida'],
    });
    const attempt = scoreAttempt(entry.id, 1, {
      elementCount: 1,
      roleId,
      elementValues: { [a.execution_t1[0]]: [0.1], [a.execution_t2[0]]: [0.1], [a.difficulty[0]]: [0.5] },
      headJudge: [a.head_judge[0], 0],
    });
    addScore(attempt.id, a.synchronisation[0], getJudgeRoleIds().synchronisation, 8);

    const [result] = attemptsOf(buildResultsData(comp, makeT('en'), 'en'));
    expect(result.rows.map(r => r.roleKey)).toEqual(['execution_t1', 'execution_t2', 'difficulty']);
    expect(result.summary.find(x => x.label === 'S').value).toBe('16.0');
  });

  it('shows landing, bonus and missing skill next to the ten skills', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id);
    const entry = makeEntry(makeRound(group.id).id, makeSportsman(comp.id, group.id, 'Solo').id, 1);
    const { assignments: a, roleId } = staff(comp, { execution: ['Anna'], difficulty: ['Gerd'], head_judge: ['Ida'] });
    scoreAttempt(entry.id, 1, {
      elementCount: 10,
      roleId,
      // eleventh value is the landing (execution) or the bonus (difficulty), the twelfth the missing skill deduction
      elementValues: { [a.execution[0]]: [...Array(10).fill(0.1), 0.2], [a.difficulty[0]]: [...Array(10).fill(0.5), 0.3, 2] },
      headJudge: [a.head_judge[0], 0],
    });

    const [attempt] = attemptsOf(buildResultsData(comp, makeT('en'), 'en'));
    expect(attempt.rows[0]).toMatchObject({ roleKey: 'execution', landing: '0.2', bonus: null, missingSkill: null, total: '8.8' });
    expect(attempt.rows[0].tricks).toEqual(Array(10).fill('0.1'));
    expect(attempt.rows[1]).toMatchObject({ roleKey: 'difficulty', landing: null, bonus: '0.3', missingSkill: '2.0', total: '3.3' });
    expect(attempt.final).toBe('12.1');
  });

  it('keeps skipped and pending attempts without rows and shows no final value', () => {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id);
    const entry = makeEntry(makeRound(group.id).id, makeSportsman(comp.id, group.id, 'Solo').id, 1);
    const { assignments: a } = staff(comp, { head_judge: ['Ida'] });
    const scored = makeAttempt(entry.id, 1, 0);
    addScore(scored.id, a.head_judge[0], getJudgeRoleIds().head_judge, 0.2);
    db.prepare("UPDATE attempts SET status='scored' WHERE id=?").run(scored.id);
    const skipped = makeAttempt(entry.id, 2, 10);
    db.prepare("UPDATE attempts SET status='skipped' WHERE id=?").run(skipped.id);
    makeAttempt(entry.id, 3, 10);

    const attempts = attemptsOf(buildResultsData(comp, makeT('en'), 'en'));
    expect(attempts.map(x => [x.number, x.status, x.rows.length, x.summary.length, x.final])).toEqual([
      [1, 'scored', 2, 3, '-0.2'], [2, 'skipped', 0, 0, null], [3, 'pending', 0, 0, null],
    ]);
  });
});

describe('sample-results.json', () => {
  // every key path of a document, arrays are flattened to [] and null values still count as a path
  function pathsOf(value, prefix = '', out = new Set()) {
    if (Array.isArray(value)) value.forEach(item => pathsOf(item, `${prefix}[]`, out));
    else if (value !== null && typeof value === 'object') Object.entries(value).forEach(([key, item]) => pathsOf(item, `${prefix}.${key}`, out));
    else out.add(prefix);
    return out;
  }

  function figStyleDocument() {
    const comp = makeCompetition({ panelKey: 'test' });
    const group = makeGroup(comp.id);
    const entry = makeEntry(makeRound(group.id).id, makeSportsman(comp.id, group.id, 'Solo').id, 1);
    const roleIds = getJudgeRoleIds();
    const exec = assignJudge(comp.id, roleIds.execution, makeUser('referee').id);
    const diff = assignJudge(comp.id, roleIds.difficulty, makeUser('referee').id);
    const head = assignJudge(comp.id, roleIds.head_judge, makeUser('head_judge').id);
    const roleOf = { [exec]: roleIds.execution, [diff]: roleIds.difficulty };
    scoreAttempt(entry.id, 1, {
      elementCount: 10,
      roleId: (id) => roleOf[id],
      elementValues: { [exec]: [...Array(10).fill(0.1), 0.2], [diff]: [...Array(10).fill(0.5), 0.3, 2] },
      headJudge: [head, 0],
    });
    const skipped = makeAttempt(entry.id, 2, 10);
    db.prepare("UPDATE attempts SET status='skipped' WHERE id=?").run(skipped.id);
    return buildResultsData(comp, makeT('en'), 'en');
  }

  function localStyleDocument() {
    const comp = makeCompetition({ panelKey: 'local' });
    const group = makeGroup(comp.id);
    const entry = makeEntry(makeRound(group.id).id, makeSportsman(comp.id, group.id, 'Solo').id, 1);
    const roleIds = getJudgeRoleIds();
    const exec = assignJudge(comp.id, roleIds.execution, makeUser('referee').id);
    const head = assignJudge(comp.id, roleIds.head_judge, makeUser('head_judge').id);
    scoreAttempt(entry.id, 1, { elementCount: 2, roleId: () => roleIds.execution, elementValues: { [exec]: [0.1, 0.2] }, headJudge: [head, 0] });
    return buildResultsData(comp, makeT('en'), 'en');
  }

  it('has exactly the fields the builder produces', () => {
    const sample = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../src/templates/results/sample-results.json'), 'utf8'));
    const built = new Set([...pathsOf(figStyleDocument()), ...pathsOf(localStyleDocument())]);
    const sampled = pathsOf(sample);
    expect([...built].filter(p => !sampled.has(p)), 'missing from the sample').toEqual([]);
    expect([...sampled].filter(p => !built.has(p)), 'not produced by the builder').toEqual([]);
  });
});
