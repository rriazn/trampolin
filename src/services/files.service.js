const fileType = require("file-type");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { addSportsmanDB, getSportsmenWithGroup } = require("./db/sportsmen.crud");
const { createOrIgnoreUserDB } = require("./db/users.crud");
const { getGroupByCompetitionAbbreviation } = require("./db/groups.crud");
const { getCompetitionById } = require("./db/competitions.crud");
const { parseSportsmanInput } = require("./sportsmen.service");
const { normalizeRole } = require("./users.service");

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

exports.isXlsxBuffer = async (buffer) => {
    const type = await fileType.fileTypeFromBuffer(buffer);
    return !!type && type.mime === XLSX_MIME;
};

exports.createUsersXlsx = (users) => {
    const ws = XLSX.utils.json_to_sheet(users.map(u => ({
        Name: u.name,
        Email: u.email,
        Role: u.role,
        'Created At': u.created_at.substring(0, 10),
    })));
    ws['!cols'] = [{ wch: 28 }, { wch: 36 }, { wch: 10 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Referees');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf;
};

exports.parseUsersXlsx = async (buffer) => {
    let rows = [];
    try {
        const wb = XLSX.read(buffer, { type: 'buffer' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } catch {
        // structurally valid enough to pass the magic-byte check, but unparseable
    }
    const defaultHash = await bcrypt.hash('referee123', 10);
    let created = 0, skipped = 0;
    for (const row of rows) {
        const name = String(row['Name'] || row['name'] || '').trim();
        const email = String(row['Email'] || row['email'] || '').trim().toLowerCase();
        if (!name || !email) { skipped++; continue; }
        const hash = row['Password'] || row['password']
        ? await bcrypt.hash(String(row['Password'] || row['password']), 10)
        : defaultHash;
        const role = String(row['Role'] || row['role'] || 'referee').trim().toLowerCase();
        const info = createOrIgnoreUserDB(name, email, hash, normalizeRole(role));
        info.changes ? created++ : skipped++;
    }
    return { created, skipped };
};

const INDIVIDUAL_COLUMNS = ['Name', 'Club', 'Gender', 'Birthyear', 'Routine', 'Group'];
const SYNCHRO_COLUMNS = ['Name 1', 'Club 1', 'Gender 1', 'Birthyear 1', 'Name 2', 'Club 2', 'Gender 2', 'Birthyear 2', 'Routine', 'Group'];

exports.createSportsmenXlsx = (competitionId) => {
    const isSynchro = getCompetitionById(competitionId)?.type === 'synchro';
    const sportsmen = getSportsmenWithGroup(competitionId);
    const rows = sportsmen.map(s => isSynchro ? {
        'Name 1': s.name,
        'Club 1': s.club || '',
        'Gender 1': s.gender || '',
        'Birthyear 1': s.birth_year || '',
        'Name 2': s.partner_name || '',
        'Club 2': s.partner_club || '',
        'Gender 2': s.partner_gender || '',
        'Birthyear 2': s.partner_birth_year || '',
        Routine: s.routine || '',
        Group: s.group_abbreviation || '',
    } : {
        Name: s.name,
        Club: s.club || '',
        Gender: s.gender || '',
        Birthyear: s.birth_year || '',
        Routine: s.routine || '',
        Group: s.group_abbreviation || '',
    });
    const ws = XLSX.utils.json_to_sheet(rows, { header: isSynchro ? SYNCHRO_COLUMNS : INDIVIDUAL_COLUMNS });
    ws['!cols'] = isSynchro
        ? [{ wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }]
        : [{ wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sportsmen');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf;
};

// headers are matched case-insensitively, the first non-empty variant wins
const readCell = (lowerRow, ...names) => {
    for (const name of names) {
        const value = String(lowerRow[name] ?? '').trim();
        if (value) return value;
    }
    return '';
};

// maps one sheet row onto the same fields the admin form posts, so both paths share one validation
const rowToSportsmanBody = (row, isSynchro) => {
    const lower = Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase(), value]));
    const body = {
        routine: readCell(lower, 'routine'),
    };
    if (isSynchro) {
        Object.assign(body, {
            name: readCell(lower, 'name 1'),
            club: readCell(lower, 'club 1'),
            gender: readCell(lower, 'gender 1'),
            birth_year: readCell(lower, 'birthyear 1', 'birth year 1'),
            partner_name: readCell(lower, 'name 2'),
            partner_club: readCell(lower, 'club 2'),
            partner_gender: readCell(lower, 'gender 2'),
            partner_birth_year: readCell(lower, 'birthyear 2', 'birth year 2'),
        });
    } else {
        Object.assign(body, {
            name: readCell(lower, 'name'),
            club: readCell(lower, 'club'),
            gender: readCell(lower, 'gender'),
            birth_year: readCell(lower, 'birthyear', 'birth year', 'birth_year'),
        });
    }
    return { body, abbrev: readCell(lower, 'group') };
};

exports.parseSportsmenXlsx = (competitionId, buffer) => {
    const competition = getCompetitionById(competitionId) || { type: 'individual' };
    let rows = [];
    try {
        const wb = XLSX.read(buffer, { type: 'buffer' });
        rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    } catch {
        // unparseable file: rows stays empty, all will be counted as skipped
    }
    const insertAll = db.transaction(() => {
        let created = 0, skipped = 0, unknownGroup = 0;
        for (const row of rows) {
        const { body, abbrev } = rowToSportsmanBody(row, competition.type === 'synchro');
        const group_id = abbrev ? (getGroupByCompetitionAbbreviation(competitionId, abbrev)?.id || null) : null;
        const { error, values } = parseSportsmanInput({ ...body, group_id }, competition);
        if (error) { skipped++; continue; }
        if (abbrev && !group_id) unknownGroup++;
        addSportsmanDB(values.name, values.club, values.gender, values.birth_year, values.routine, competitionId, values.group_id, values.partner);
        created++;
        }
        return { created, skipped, unknownGroup };
    });
    return insertAll();
};
