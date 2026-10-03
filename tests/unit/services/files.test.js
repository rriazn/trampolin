import { describe, it, expect } from 'vitest';
import XLSX from 'xlsx';
import { db, require, makeCompetition, makeGroup } from './testHelpers.js';
const {
  isXlsxBuffer, createUsersXlsx, parseUsersXlsx, createSportsmenXlsx, parseSportsmenXlsx, buildZip, MAX_IMPORT_ROWS,
} = require('../../../src/services/files.service.js');

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

  it('rejects a workbook that declares more than 50 MB unpacked', async () => {
    const buf = xlsxBufferFromRows([['a'], [1]]);
    // patch the uncompressed size of the first central directory entry
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    buf.writeUInt32LE(60 * 1024 * 1024, buf.readUInt32LE(eocd + 16) + 24);
    expect(await isXlsxBuffer(buf)).toBe(false);
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

describe('import row limit', () => {
  const rowsOfSportsmen = (count) => [['Name', 'Group'], ...Array.from({ length: count }, (_, i) => [`Athlete ${i}`, ''])];

  it('reads at most MAX_IMPORT_ROWS rows and reports the cut', () => {
    const comp = makeCompetition();
    const result = parseSportsmenXlsx(comp.id, xlsxBufferFromRows(rowsOfSportsmen(MAX_IMPORT_ROWS + 5)));
    expect(result).toMatchObject({ created: MAX_IMPORT_ROWS, truncated: true });
  });

  it('does not report a cut when the sheet fits', () => {
    const comp = makeCompetition();
    const result = parseSportsmenXlsx(comp.id, xlsxBufferFromRows(rowsOfSportsmen(MAX_IMPORT_ROWS)));
    expect(result).toMatchObject({ created: MAX_IMPORT_ROWS, truncated: false });
  });

  it('only reads the first sheet', () => {
    const comp = makeCompetition();
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name'], ['First Sheet']]), 'One');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name'], ['Second Sheet']]), 'Two');
    parseSportsmenXlsx(comp.id, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    const names = db.prepare('SELECT name FROM sportsmen WHERE competition_id=?').all(comp.id).map(r => r.name);
    expect(names).toEqual(['First Sheet']);
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

  it('does not count an unknown group for a row that is skipped anyway', async () => {
    const comp = makeCompetition();
    const buf = xlsxBufferFromRows([['Name', 'Group'], ['', 'NOPE']]);
    const { skipped, unknownGroup } = parseSportsmenXlsx(comp.id, buf);
    expect(skipped).toBe(1);
    expect(unknownGroup).toBe(0);
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

function makeSynchroCompetition() {
  const id = db.prepare("INSERT INTO competitions (name, type) VALUES (?, 'synchro')").run(`Synchro ${Math.random()}`).lastInsertRowid;
  return { id };
}

function sheetRows(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
}

const pairByName = (compId, name) => db.prepare('SELECT * FROM sportsmen WHERE competition_id=? AND name=?').get(compId, name);

describe('sportsmen gender in imports', () => {
  it('reads upper case genders and stores an unknown gender as null instead of failing the import', () => {
    const comp = makeCompetition();
    const buf = xlsxBufferFromRows([['Name', 'Gender'], ['Upper Case', 'M'], ['Unknown Gender', 'x'], ['Word Gender', 'female']]);

    const { created } = parseSportsmenXlsx(comp.id, buf);

    expect(created).toBe(3);
    expect(pairByName(comp.id, 'Upper Case').gender).toBe('m');
    expect(pairByName(comp.id, 'Unknown Gender').gender).toBeNull();
    expect(pairByName(comp.id, 'Word Gender').gender).toBeNull();
  });
});

describe('individual sportsmen xlsx layout', () => {
  it('keeps the single athlete columns and ignores second athlete columns on import', () => {
    const comp = makeCompetition();
    const buf = xlsxBufferFromRows([['Name', 'Name 2', 'Club'], ['Solo Jumper', 'Not A Partner', 'TSV']]);

    parseSportsmenXlsx(comp.id, buf);

    expect(pairByName(comp.id, 'Solo Jumper')).toMatchObject({ club: 'TSV', partner_name: null });
    parseSportsmenXlsx(comp.id, xlsxBufferFromRows([['Name'], ['Header Check']]));
    expect(sheetRows(createSportsmenXlsx(comp.id))[0]).toEqual(['Name', 'Club', 'Gender', 'Birthyear', 'Routine', 'Group']);
  });
});

describe('synchro sportsmen xlsx layout', () => {
  const headers = ['Name 1', 'Club 1', 'Gender 1', 'Birthyear 1', 'Name 2', 'Club 2', 'Gender 2', 'Birthyear 2', 'Routine', 'Group'];

  it('imports one pair per row', () => {
    const comp = makeSynchroCompetition();
    const group = makeGroup(comp.id, 'Pairs A');
    const abbrev = db.prepare('SELECT abbreviation FROM groups WHERE id=?').get(group.id).abbreviation;
    const buf = xlsxBufferFromRows([headers, ['Leon Weber', 'TSV', 'M', 2008, 'Emma Fischer', 'SV', 'f', 2009, 'W11', abbrev]]);

    const { created, skipped, unknownGroup } = parseSportsmenXlsx(comp.id, buf);

    expect({ created, skipped, unknownGroup }).toEqual({ created: 1, skipped: 0, unknownGroup: 0 });
    expect(pairByName(comp.id, 'Leon Weber')).toMatchObject({
      club: 'TSV', gender: 'm', birth_year: 2008, routine: 'W11', group_id: group.id,
      partner_name: 'Emma Fischer', partner_club: 'SV', partner_gender: 'f', partner_birth_year: 2009,
    });
  });

  it('accepts lower case headers', () => {
    const comp = makeSynchroCompetition();
    const buf = xlsxBufferFromRows([['name 1', 'club 1', 'name 2', 'club 2'], ['Lower A', 'X', 'Lower B', 'Y']]);

    parseSportsmenXlsx(comp.id, buf);

    expect(pairByName(comp.id, 'Lower A')).toMatchObject({ club: 'X', partner_name: 'Lower B', partner_club: 'Y' });
  });

  it('skips a row that is missing either athlete name', () => {
    const comp = makeSynchroCompetition();
    const buf = xlsxBufferFromRows([
      ['Name 1', 'Name 2'],
      ['Only First', ''],
      ['', 'Only Second'],
      ['Complete A', 'Complete B'],
    ]);

    const { created, skipped } = parseSportsmenXlsx(comp.id, buf);

    expect({ created, skipped }).toEqual({ created: 1, skipped: 2 });
    expect(pairByName(comp.id, 'Only First')).toBeUndefined();
  });

  it('counts an unknown group abbreviation and leaves the pair ungrouped', () => {
    const comp = makeSynchroCompetition();
    const buf = xlsxBufferFromRows([['Name 1', 'Name 2', 'Group'], ['A', 'B', 'NOPE']]);

    const { created, unknownGroup } = parseSportsmenXlsx(comp.id, buf);

    expect({ created, unknownGroup }).toEqual({ created: 1, unknownGroup: 1 });
    expect(pairByName(comp.id, 'A').group_id).toBeNull();
  });

  it('stores unknown genders as null', () => {
    const comp = makeSynchroCompetition();
    const buf = xlsxBufferFromRows([['Name 1', 'Gender 1', 'Name 2', 'Gender 2'], ['G1', 'x', 'G2', 'y']]);

    parseSportsmenXlsx(comp.id, buf);

    expect(pairByName(comp.id, 'G1')).toMatchObject({ gender: null, partner_gender: null });
  });

  it('exports both athletes with the synchro columns', () => {
    const comp = makeSynchroCompetition();
    parseSportsmenXlsx(comp.id, xlsxBufferFromRows([headers, ['Leon Weber', 'TSV', 'm', 2008, 'Emma Fischer', 'SV', 'f', 2009, 'W11', '']]));

    const rows = sheetRows(createSportsmenXlsx(comp.id));

    expect(rows[0]).toEqual(headers);
    expect(rows[1]).toEqual(['Leon Weber', 'TSV', 'm', 2008, 'Emma Fischer', 'SV', 'f', 2009, 'W11', '']);
  });

  it('round-trips: an exported pair list re-imports into another synchro competition', () => {
    const source = makeSynchroCompetition();
    parseSportsmenXlsx(source.id, xlsxBufferFromRows([headers, ['Round A', 'TSV', 'm', 2008, 'Round B', 'SV', 'f', 2009, 'W11', '']]));
    const target = makeSynchroCompetition();

    parseSportsmenXlsx(target.id, createSportsmenXlsx(source.id));

    expect(pairByName(target.id, 'Round A')).toMatchObject({
      club: 'TSV', gender: 'm', birth_year: 2008, routine: 'W11',
      partner_name: 'Round B', partner_club: 'SV', partner_gender: 'f', partner_birth_year: 2009,
    });
  });
});

describe('buildZip', () => {
  const entries = [
    { name: 'certificates-cup-group-a.pdf', buffer: Buffer.from('%PDF-first') },
    { name: 'certificates-cup-group-b.pdf', buffer: Buffer.from('%PDF-second') },
  ];

  // entry names from the central directory, which is what an unzip tool lists (CFB.read adds its own placeholder entry)
  function zipEntryNames(zip) {
    const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = zip.readUInt16LE(eocd + 10);
    let offset = zip.readUInt32LE(eocd + 16);
    const names = [];
    for (let i = 0; i < count; i++) {
      const nameLength = zip.readUInt16LE(offset + 28);
      names.push(zip.subarray(offset + 46, offset + 46 + nameLength).toString('utf8'));
      offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
    }
    return names;
  }

  it('lists exactly the given entries, without the placeholder entry of the writer', () => {
    const zip = buildZip(entries);
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    expect(zipEntryNames(zip)).toEqual(entries.map(e => e.name));
  });

  it('round trips the contents', () => {
    const cfb = XLSX.CFB.read(buildZip(entries), { type: 'buffer' });
    entries.forEach((entry) => {
      const content = cfb.FileIndex[cfb.FullPaths.indexOf(`Root Entry/${entry.name}`)].content;
      expect(Buffer.from(content).equals(entry.buffer)).toBe(true);
    });
  });
});
