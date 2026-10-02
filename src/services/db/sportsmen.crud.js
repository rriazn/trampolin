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
        SELECT s.name, s.club, s.gender, s.birth_year, s.routine, g.abbreviation AS group_abbreviation,
            s.partner_name, s.partner_club, s.partner_gender, s.partner_birth_year
        FROM sportsmen s
        LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.competition_id = ?
        ORDER BY s.name
    `).all(competitionId);
};

exports.getAvailableSportsmen = (competitionId, groupId, roundId) => {
    return db.prepare(`
        SELECT s.*, g.name AS group_name
        FROM sportsmen s
        LEFT JOIN groups g ON g.id = s.group_id
        WHERE s.competition_id = ?
        AND s.group_id = ?
        AND s.id NOT IN (SELECT sportsman_id FROM entries WHERE round_id = ?)
        ORDER BY s.name
    `).all(competitionId, groupId, roundId);
}

exports.getSportsmanByNameAndCompetition = (name, competitionId) => {
    return db.prepare('SELECT id FROM sportsmen WHERE name=? AND competition_id=?').get(name, competitionId);
};

// partner holds athlete 2 of a synchro pair: { name, club, gender, birth_year }
exports.addSportsmanDB = (name, club, gender, birth_year, routine, competitionId, groupId, partner = {}) => {
    return db.prepare(`
        INSERT INTO sportsmen (name,club,gender,birth_year,routine,competition_id,group_id,partner_name,partner_club,partner_gender,partner_birth_year)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
    `).run(name.trim(), club || null, gender || null, birth_year ? parseInt(birth_year) : null, routine || null, competitionId, groupId || null,
        partner.name || null, partner.club || null, partner.gender || null, partner.birth_year ? parseInt(partner.birth_year) : null);
};

exports.updateSportsmanDB = (id, name, club, gender, birth_year, routine, group_id, partner = {}) => {
    db.prepare(`
        UPDATE sportsmen SET name=?,club=?,gender=?,birth_year=?,routine=?,group_id=?,
            partner_name=?,partner_club=?,partner_gender=?,partner_birth_year=?
        WHERE id=?
    `).run(name.trim(), club || null, gender || null, birth_year ? parseInt(birth_year) : null, routine || null, group_id || null,
        partner.name || null, partner.club || null, partner.gender || null, partner.birth_year ? parseInt(partner.birth_year) : null, id);
};

exports.deleteSportsmanDB = (id) => {
    db.prepare('DELETE FROM sportsmen WHERE id=?').run(id);
};

exports.deleteAllSportsmenDB = () => {
    db.prepare('DELETE FROM sportsmen').run();
};