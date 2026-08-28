const db = require('../../db/database');


exports.getSportsmenCount = () => {
    return db.prepare('SELECT COUNT(*) AS n FROM sportsmen').get().n;
};

exports.getSportsmenById = (id) => {
    return db.prepare('SELECT * FROM sportsmen WHERE id=?').get(id);
};

exports.getSportsmenByCompetition = (competitionId) => {
    return db.prepare(`
        SELECT s.*, g.name AS group_name
        FROM sportsmen s
        LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.competition_id = ?
        ORDER BY s.name
    `).all(competitionId);
};

exports.getSportsmenWithGroup = (competitionId) => {
    return db.prepare(`
        SELECT s.name, s.club, s.gender, s.birth_year, s.routine, g.abbreviation AS group_abbreviation
        FROM sportsmen s
        LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.competition_id = ?
        ORDER BY s.name
    `).all(competitionId);
};

exports.getAvailableSportsmen = (competitionId, roundId) => {
    return db.prepare(`
        SELECT s.*, g.name AS group_name
        FROM sportsmen s
        LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.competition_id = ?
        AND s.id NOT IN (SELECT sportsman_id FROM entries WHERE round_id = ?)
        ORDER BY s.name
    `).all(competitionId, roundId);
}

exports.addSportsmanDB = (name, club, gender, birth_year, routine, competitionId, groupId) => {
    db.prepare('INSERT INTO sportsmen (name,club,gender,birth_year,routine,competition_id,group_id) VALUES (?,?,?,?,?,?,?)')
        .run(name.trim(), club || null, gender || null, birth_year ? parseInt(birth_year) : null, routine || null, competitionId, groupId || null);
};

exports.updateSportsmanDB = (id, name, club, gender, birth_year, routine, group_id) => {
        db.prepare('UPDATE sportsmen SET name=?,club=?,gender=?,birth_year=?,routine=?,group_id=? WHERE id=?')
        .run(name.trim(), club || null, gender || null, birth_year ? parseInt(birth_year) : null, routine || null, group_id || null, id);
};

exports.deleteSportsmanDB = (id) => {
    db.prepare('DELETE FROM sportsmen WHERE id=?').run(id);
};