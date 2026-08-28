const db = require('../../db/database');


exports.getRoundsByGroup = (groupId) => {
    return db.prepare('SELECT * FROM rounds WHERE group_id=? ORDER BY round_order').all(groupId);
};
 
exports.getRoundById = (roundId) => {
    return db.prepare(`
        SELECT r.*, g.competition_id
        FROM rounds r JOIN groups g ON g.id = r.group_id
        WHERE r.id = ?
    `).get(roundId);
}

exports.getRoundByIdWithCompGroupInfo = (roundId, groupId) => {
    return db.prepare(`
        SELECT r.*, g.id AS group_id, g.name AS group_name,
            c.id AS competition_id, c.name AS competition_name, c.panel_template_id
        FROM rounds r
        JOIN groups g ON g.id = r.group_id
        JOIN competitions c ON c.id = g.competition_id
        WHERE r.id = ? AND r.group_id = ?
    `).get(roundId, groupId);
};

exports.getOrderedRoundGroupCompInfoAdmin = () => {
    return db.prepare(`
            SELECT r.id, r.name, r.round_order, r.status,
                g.id AS group_id, g.name AS group_name,
                c.id AS competition_id, c.name AS competition_name, c.panel_template_id
            FROM rounds r
            JOIN groups g ON g.id = r.group_id
            JOIN competitions c ON c.id = g.competition_id
            WHERE c.status = 'active'
            ORDER BY c.name, g.name, r.round_order
        `).all();
    };

// Rounds a referee/judge (any role, not just head_judge) can currently score
exports.getInProgressRoundsForUser = (userId) => {
    return db.prepare(`
            SELECT DISTINCT r.id, r.name, r.round_order,
                g.id AS group_id, g.name AS group_name,
                c.id AS competition_id, c.name AS competition_name
            FROM rounds r
            JOIN groups g ON g.id = r.group_id
            JOIN competitions c ON c.id = g.competition_id
            JOIN panel_assignments pa ON pa.competition_id = c.id AND pa.user_id = ?
            WHERE r.status = 'in_progress' AND c.status = 'active'
            ORDER BY c.name, g.name, r.round_order
        `).all(userId);
};

exports.getOrderedRoundGroupCompInfoUser = (userId) => {
    return db.prepare(`
            SELECT DISTINCT r.id, r.name, r.round_order, r.status,
                g.id AS group_id, g.name AS group_name,
                c.id AS competition_id, c.name AS competition_name, c.panel_template_id
            FROM rounds r
            JOIN groups g ON g.id = r.group_id
            JOIN competitions c ON c.id = g.competition_id
            JOIN panel_assignments pa ON pa.competition_id = c.id AND pa.user_id = ?
            JOIN judge_roles jr ON jr.id = pa.judge_role_id AND jr.key = 'head_judge'
            WHERE c.status = 'active'
            ORDER BY c.name, g.name, r.round_order
        `).all(userId);
};

exports.getPreviousRoundInfo = (groupId, roundOrder) => {
    return db.prepare(`
        SELECT id, name FROM rounds
        WHERE group_id = ? AND round_order < ?
        ORDER BY round_order DESC LIMIT 1
    `).get(groupId, roundOrder);
}

exports.addRoundDB = (groupId, name, roundOrder) => {
    db.prepare('INSERT INTO rounds (group_id,name,round_order) VALUES (?,?,?)').run(groupId, name.trim(), parseInt(roundOrder) || 0);
};

exports.updateRoundStartedDB = (roundId, attemptId) => {
    db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?").run(attemptId, roundId);
};

// Also reopens the round to 'in_progress' — used by both /next (already in_progress) and /back
// (which can step back into a completed round, undoing its completion)
exports.updateRoundCurrentAttemptDB = (roundId, attemptId) => {
    db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?").run(attemptId, roundId);
};

exports.updateRoundCompletedDB = (roundId) => {
    db.prepare("UPDATE rounds SET status='completed', current_attempt_id=NULL WHERE id=?").run(roundId);
}

exports.deleteRoundDB = (roundId, groupId) => {
    db.prepare('DELETE FROM rounds WHERE id=? AND group_id=?').run(roundId, groupId);
};