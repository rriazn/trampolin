const fileType = require("file-type");
const XLSX = require("xlsx");
const bcrypt = require("bcryptjs");
const db = require("../db/database");
const { addSportsmanDB, getSportsmenWithGroup } = require("./db/sportsmen.crud");
const { createOrIgnoreUserDB } = require("./db/users.crud");
const { getGroupByCompetitionAbbreviation } = require("./db/groups.crud");
const { normalizeRole } = require("./users");

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

exports.createSportsmenXlsx = (competitionId) => {
    const sportsmen = getSportsmenWithGroup(competitionId);
    const ws = XLSX.utils.json_to_sheet(sportsmen.map(s => ({
        Name: s.name,
        Club: s.club || '',
        Gender: s.gender || '',
        Birthyear: s.birth_year || '',
        Routine: s.routine || '',
        Group: s.group_abbreviation || '',
    })));
    ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sportsmen');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    return buf;
};

exports.parseSportsmenXlsx = (competitionId, buffer) => {
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
        const name = String(row['Name'] || row['name'] || '').trim();
        if (!name) { skipped++; continue; }
        const club = String(row['Club'] || row['club'] || '').trim() || null;
        const gender = String(row['Gender'] || row['gender'] || '').trim() || null;
        const birth_year_raw = String(row['Birthyear'] || row['Birth Year'] || row['birth_year'] || '').trim();
        const birth_year = birth_year_raw ? parseInt(birth_year_raw) : null;
        const routine = String(row['Routine'] || row['routine'] || '').trim() || null;
        const abbrev = String(row['Group'] || row['group'] || '').trim();
        const group_id = abbrev ? (getGroupByCompetitionAbbreviation(competitionId, abbrev)?.id || null) : null;
        if (abbrev && !group_id) unknownGroup++;
        addSportsmanDB(name, club, gender, birth_year, routine, competitionId, group_id);
        created++;
        }
        return { created, skipped, unknownGroup };
    });
    return insertAll();
};