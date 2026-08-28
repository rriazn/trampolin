const db = require('../../db/database');


exports.getScoreForAttemptByPanelId = (attemptId, panelAssignmentId) => {
    return db.prepare('SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?')
        .get(attemptId, panelAssignmentId);
};

exports.getScoresForAttempt = (attemptId) => {
    return db.prepare('SELECT judge_role_id, score FROM scores WHERE attempt_id=?').all(attemptId);
};

exports.getScoresForAssignment = (attemptId) => {
    return db.prepare('SELECT panel_assignment_id, score FROM scores WHERE attempt_id=?').all(attemptId);
};

exports.getElementScoresForAttempt = (attemptId) => {
    return db.prepare('SELECT judge_role_id, panel_assignment_id, element_number, value FROM element_scores WHERE attempt_id=?').all(attemptId);
};

exports.getElementScoreForAttemptAndAssignment = (attemptId, assignmentId) => {
    return db.prepare(
            'SELECT element_number, value FROM element_scores WHERE attempt_id=? AND panel_assignment_id=?'
        ).all(attemptId, assignmentId);
};

exports.getScoreForAttemptAndAssignment = (attemptId, assignmentId) => {
    return db.prepare(
        'SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?'
        ).get(attemptId, assignmentId);
}; 

exports.getElementScoresForAttemptWithinElementCount = (attemptId, elementCount) => {
    return db.prepare('SELECT panel_assignment_id, element_number, value FROM element_scores WHERE attempt_id=? AND element_number<=? ORDER BY element_number').all(attemptId, elementCount);
};

exports.getElementScoresLandingBonus = (attemptId) => {
    return db.prepare('SELECT panel_assignment_id, value FROM element_scores WHERE attempt_id=? AND element_number=11').all(attemptId);
};

exports.getAttemptElementCount = (attemptId) => {
    return db.prepare('SELECT element_count FROM attempts WHERE id=?').get(attemptId);
};

exports.getAttemptScoreRows = (roundId) => {
    return db.prepare(`
        SELECT s.attempt_id, s.judge_role_id, s.score
        FROM scores s JOIN attempts a ON a.id = s.attempt_id JOIN entries e ON e.id = a.entry_id
        WHERE e.round_id = ?
    `).all(roundId);
};

exports.getElementScoreRows = (roundId) => {
    return db.prepare(`
        SELECT es.attempt_id, es.judge_role_id, es.panel_assignment_id, es.element_number, es.value
        FROM element_scores es JOIN attempts a ON a.id = es.attempt_id JOIN entries e ON e.id = a.entry_id
        WHERE e.round_id = ?
    `).all(roundId);
};

exports.getPerJudgeElementScoreRows = (roundId) => {
    return db.prepare(`
        SELECT es.attempt_id, es.judge_role_id, es.panel_assignment_id, es.element_number, es.value, u.name AS judge_name
        FROM element_scores es
        JOIN attempts a ON a.id = es.attempt_id
        JOIN entries e ON e.id = a.entry_id
        JOIN panel_assignments pa ON pa.id = es.panel_assignment_id
        JOIN users u ON u.id = pa.user_id
        WHERE e.round_id = ?
        ORDER BY u.name
    `).all(roundId);
};

exports.addAttemptScoreDB = (attemptId, assignmentId, judgeRoleId, score) => {
    db.prepare('INSERT OR REPLACE INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
        .run(attemptId, assignmentId, judgeRoleId, score);
};

exports.addAllElementScoresDB = (parsedValues, attemptId, assignmentId, judgeRoleId) => {
    const upsert = db.prepare(
        'INSERT OR REPLACE INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,?,?)'
    );
    db.transaction(() => {
        for (const [n, value] of parsedValues) upsert.run(attemptId, assignmentId, judgeRoleId, n, value);
    })();
};

exports.updateAttemptElementCount = (attemptId, elementCount) => {
    db.prepare('UPDATE attempts SET element_count=? WHERE id=?').run(elementCount, attemptId);
};

exports.deleteAllScoresDB = () => {
    db.prepare('DELETE FROM scores').run();
};

exports.deleteAllElementScoresDB = () => {
    db.prepare('DELETE FROM element_scores').run();
};