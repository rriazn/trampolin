const db = require('../../db/database');


exports.getGroupsByCompetition = (competitionId) => {
    return db.prepare('SELECT * FROM groups WHERE competition_id=? ORDER BY name').all(competitionId);
};

exports.getGroupById = (groupId) => {
    return db.prepare('SELECT * FROM groups WHERE id=?').get(groupId);
};

exports.getGroupByCompetitionAbbreviation = (competitionId, abbreviation) => {
    return db.prepare('SELECT id FROM groups WHERE competition_id=? AND abbreviation=?').get(competitionId, abbreviation);
};

exports.getGroupsRoundCount = (competitionId) => {
    return db.prepare(`
        SELECT g.*, COUNT(r.id) AS round_count
        FROM groups g
        LEFT JOIN rounds r ON r.group_id = g.id
        WHERE g.competition_id = ?
        GROUP BY g.id
        ORDER BY g.name
    `).all(competitionId);
};

exports.addGroupDB = (name, abbreviation, competitionId) => {
    db.prepare('INSERT INTO groups (name, abbreviation, competition_id) VALUES (?, ?, ?)').run(name.trim(), abbreviation.trim(), competitionId);
};

exports.deleteGroupDB = (groupId, competitionId) => {
    db.prepare('DELETE FROM groups WHERE id=? AND competition_id=?').run(groupId, competitionId);
}