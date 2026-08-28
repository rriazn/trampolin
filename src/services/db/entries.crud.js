const db = require('../../db/database');


exports.getEntryIdsForRound = (roundId) => {
    return db.prepare('SELECT id FROM entries WHERE round_id = ?').all(roundId);
};

exports.getEntriesWithAttemptsInfo = (roundId) => {
    return db.prepare(`
        SELECT e.*, sp.name AS sportsman_name, sp.club, sp.routine,
            (SELECT COUNT(*) FROM attempts a WHERE a.entry_id=e.id) AS attempt_count
        FROM entries e
        JOIN sportsmen sp ON sp.id = e.sportsman_id
        LEFT JOIN groups g ON g.id = sp.group_id
        WHERE e.round_id = ?
        ORDER BY e.start_order
    `).all(roundId);
};

exports.getDetailedEntryRows = (roundId) => {
    return db.prepare(`
        SELECT
        sp.id AS sportsman_id, sp.name AS sportsman_name, sp.club,
        g.name AS group_name,
        e.start_order,
        a.id AS attempt_id, a.attempt_number, a.element_count
        FROM entries e
        JOIN sportsmen sp ON sp.id = e.sportsman_id
        LEFT JOIN groups g ON g.id = sp.group_id
        JOIN attempts a ON a.entry_id = e.id
        WHERE e.round_id = ?
        ORDER BY sp.id, a.attempt_number
    `).all(roundId);
};

exports.getEntryAttemptRows = (roundId) => {
    return db.prepare(`
        SELECT a.id AS attempt_id, a.element_count, e.sportsman_id
        FROM entries e
        JOIN attempts a ON a.entry_id = e.id
        WHERE e.round_id = ?
        ORDER BY e.sportsman_id, a.attempt_number
    `).all(roundId);
};

exports.getAttemptForId = (attemptId) => {
    return db.prepare(`
        SELECT a.id AS attempt_id, a.attempt_number, a.element_count,
            e.start_order, sp.name AS sportsman_name, sp.club, sp.routine
        FROM attempts a
        JOIN entries e ON e.id = a.entry_id
        JOIN sportsmen sp ON sp.id = e.sportsman_id
        WHERE a.id = ?
    `).get(attemptId);
};

exports.getEntryMaxOrder = (roundId) => {
    return db.prepare('SELECT MAX(start_order) AS max FROM entries WHERE round_id=?').get(roundId);
};

exports.getNextPendingAttemptId = (roundId) => {
  return db.prepare(`
    SELECT a.id FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.round_id = ? AND a.status = 'pending'
    ORDER BY a.attempt_number, e.start_order
    LIMIT 1
  `).get(roundId)?.id ?? null;
};

exports.getOrderedAttemptIds = (roundId) => {
  return db.prepare(`
    SELECT a.id FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.round_id = ?
    ORDER BY a.attempt_number, e.start_order
  `).all(roundId).map(r => r.id);
};

exports.getAttemptContext = (attemptId) => {
  return db.prepare(`
    SELECT a.id AS attemptId, a.element_count AS elementCount,
           r.id AS roundId, g.id AS groupId, g.competition_id AS competitionId,
           c.panel_template_id AS panelTemplateId
    FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    JOIN rounds r ON r.id = e.round_id
    JOIN groups g ON g.id = r.group_id
    JOIN competitions c ON c.id = g.competition_id
    WHERE a.id = ?
  `).get(attemptId);
};

exports.addEntryDB = (roundId, sportsmanId, startOrder) => {
    db.prepare('INSERT INTO entries (round_id,sportsman_id,start_order) VALUES (?,?,?)')
        .run(roundId, sportsmanId, parseInt(startOrder) || 0);
};

exports.addAllEntriesDB = (available, roundId, maxOrder) => {
    let nextOrder = (maxOrder.max || 0) + 1;
    const insert = db.prepare('INSERT INTO entries (round_id,sportsman_id,start_order) VALUES (?,?,?)');
    db.transaction(() => { for (const sp of available) insert.run(roundId, sp.id, nextOrder++); })();
};

exports.addAttemptsDB = (entries, count) => {
    const insertAttempt = db.prepare('INSERT OR IGNORE INTO attempts (entry_id,attempt_number) VALUES (?,?)');
    db.transaction(() => {
        for (const e of entries) {
        for (let n = 1; n <= count; n++) {
            insertAttempt.run(e.id, n);
        }
        }
    })();
};

exports.updateEntryStartOrderDB = (entries) => {
    const update = db.prepare('UPDATE entries SET start_order = ? WHERE id = ?');
    db.transaction(() => { entries.forEach((e, i) => update.run(i + 1, e.id)); })();
};

exports.updateAttemptStatusDB = (isComplete, attemptId) => {
    db.prepare("UPDATE attempts SET status=? WHERE id=?").run(isComplete ? 'scored' : 'pending', attemptId);
};

exports.updateAttemptSkippedDB = (attemptId) => {
    db.prepare("UPDATE attempts SET status='skipped' WHERE id=?").run(attemptId);
};

exports.deleteEntryDB = (entryId, roundId) => {
    db.prepare('DELETE FROM entries WHERE id=? AND round_id=?').run(entryId, roundId);
};