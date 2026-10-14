const db = require('../../db/database');


exports.getAttemptNamesForRound = (roundId) => {
    return db.prepare('SELECT attempt_number, name FROM attempt_names WHERE round_id = ? ORDER BY attempt_number').all(roundId);
};

// undefined when the attempt has no custom name
exports.getAttemptNameDB = (roundId, number) => {
    return db.prepare('SELECT name FROM attempt_names WHERE round_id = ? AND attempt_number = ?').get(roundId, number)?.name;
};

// names is [{ number, name }], an empty name removes the custom name, names beyond maxNumber are dropped
exports.saveAttemptNamesDB = (roundId, names, maxNumber) => {
    const removeBeyond = db.prepare('DELETE FROM attempt_names WHERE round_id = ? AND attempt_number > ?');
    const remove = db.prepare('DELETE FROM attempt_names WHERE round_id = ? AND attempt_number = ?');
    const upsert = db.prepare(`
        INSERT INTO attempt_names (round_id, attempt_number, name) VALUES (?, ?, ?)
        ON CONFLICT(round_id, attempt_number) DO UPDATE SET name = excluded.name
    `);
    db.transaction(() => {
        removeBeyond.run(roundId, maxNumber);
        for (const { number, name } of names) {
            if (name) upsert.run(roundId, number, name);
            else remove.run(roundId, number);
        }
    })();
};
