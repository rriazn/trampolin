import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { db, require, makeCompetition, makeGroup } from './testHelpers.js';
const {
  isXlsxBuffer, createUsersXlsx, parseUsersXlsx, createSportsmenXlsx, parseSportsmenXlsx,
} = require('../../../src/services/files.js');

function xlsxBufferFromRows(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('isXlsxBuffer', () => {
  it('accepts a real xlsx buffer', async () => {
    const buf = xlsxBufferFromRows([['a', 'b'], [1, 2]]);
    expect(await isXlsxBuffer(buf)).toBe(true);
  });

  it('rejects plain text', async () => {
    expect(await isXlsxBuffer(Buffer.from('not an excel file'))).toBe(false);
  });
});

describe('createUsersXlsx / parseUsersXlsx', () => {
  it('round-trips: exported users can be re-imported', async () => {
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
      .run('Round Tripper', 'roundtrip@test.com', 'h', 'referee');
    const buf = createUsersXlsx(db.prepare("SELECT name,email,role,created_at FROM users WHERE email='roundtrip@test.com'").all());
    expect(Buffer.isBuffer(buf)).toBe(true);

    db.prepare("DELETE FROM users WHERE email='roundtrip@test.com'").run();
    const { created } = await parseUsersXlsx(buf);
    expect(created).toBe(1);
    expect(db.prepare("SELECT * FROM users WHERE email='roundtrip@test.com'").get()).toBeDefined();
  });
});

describe('parseUsersXlsx', () => {
  it('creates users, normalizes the role, and skips rows missing name/email', async () => {
    const buf = xlsxBufferFromRows([
      ['Name', 'Email', 'Role'],
      ['New User', 'newuser@test.com', 'not-a-real-role'],
      ['', 'noname@test.com', 'referee'],
    ]);
    const { created, skipped } = await parseUsersXlsx(buf);
    expect(created).toBe(1);
    expect(skipped).toBe(1);

    const row = db.prepare("SELECT * FROM users WHERE email='newuser@test.com'").get();
    expect(row.role).toBe('referee'); // normalized
  });

  it('skips duplicate emails without creating a second row', async () => {
    db.prepare("INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)")
      .run('Existing', 'dupe@test.com', 'h', 'referee');
    const buf = xlsxBufferFromRows([['Name', 'Email', 'Role'], ['Duplicate', 'dupe@test.com', 'referee']]);
    const { created, skipped } = await parseUsersXlsx(buf);
    expect(created).toBe(0);
    expect(skipped).toBe(1);
  });
});

describe('createSportsmenXlsx / parseSportsmenXlsx', () => {
  it('assigns a group when the abbreviation matches one on the competition', async () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id, 'Group A');
    const abbrev = db.prepare('SELECT abbreviation FROM groups WHERE id=?').get(group.id).abbreviation;

    const buf = xlsxBufferFromRows([['Name', 'Group'], ['Athlete X', abbrev]]);
    const { created, unknownGroup } = parseSportsmenXlsx(comp.id, buf);
    expect(created).toBe(1);
    expect(unknownGroup).toBe(0);

    const row = db.prepare('SELECT * FROM sportsmen WHERE name=?').get('Athlete X');
    expect(row.group_id).toBe(group.id);
  });

  it('counts an unrecognized group abbreviation and leaves the athlete ungrouped', async () => {
    const comp = makeCompetition();
    const buf = xlsxBufferFromRows([['Name', 'Group'], ['Athlete Y', 'NOPE']]);
    const { created, unknownGroup } = parseSportsmenXlsx(comp.id, buf);
    expect(created).toBe(1);
    expect(unknownGroup).toBe(1);

    const row = db.prepare('SELECT * FROM sportsmen WHERE name=?').get('Athlete Y');
    expect(row.group_id).toBeNull();
  });

  it('skips rows with no name', async () => {
    const comp = makeCompetition();
    const buf = xlsxBufferFromRows([['Name', 'Club'], ['', 'Some Club']]);
    const { created, skipped } = parseSportsmenXlsx(comp.id, buf);
    expect(created).toBe(0);
    expect(skipped).toBe(1);
  });

  it('exports sportsmen with their group abbreviation as a re-importable xlsx', async () => {
    const comp = makeCompetition();
    const group = makeGroup(comp.id, 'Group B');
    parseSportsmenXlsx(comp.id, xlsxBufferFromRows([['Name'], ['Exportable']]));
    db.prepare('UPDATE sportsmen SET group_id=? WHERE name=?').run(group.id, 'Exportable');

    const buf = createSportsmenXlsx(comp.id);
    expect(await isXlsxBuffer(buf)).toBe(true);
  });
});
