const db = require('../../db/database');


exports.getCompetitionCount = () => {
    return db.prepare('SELECT COUNT(*) AS n FROM competitions').get().n;
}

exports.getCompetitions = () => {
    return db.prepare('SELECT * FROM competitions ORDER BY created_at DESC').all();
};

exports.getTopCompetitions = (n) => {
    return db.prepare('SELECT * FROM competitions ORDER BY created_at DESC LIMIT ?').all(n);
}

exports.getCompetitionById = (id) => {
    return db.prepare('SELECT * FROM competitions WHERE id=?').get(id);
};

exports.createCompetitionDB = (name, date, panel_template_id) => {
    db.prepare('INSERT INTO competitions (name,date,panel_template_id) VALUES (?,?,?)')
        .run(name.trim(), date || null, panel_template_id || null);
};

exports.updateCompetitionDB = (id, name, date, panel_template_id) => {
    db.prepare('UPDATE competitions SET name=?,date=?,panel_template_id=? WHERE id=?')
        .run(name, date || null, panel_template_id || null, id);
};

exports.updateCompetitionStatusDB = (id, status) => {
    db.prepare('UPDATE competitions SET status=? WHERE id=?').run(status, id);
};

exports.deleteCompetitionDB = (id) => {
    db.prepare('DELETE FROM competitions WHERE id=?').run(id);
};