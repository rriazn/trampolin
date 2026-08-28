const db = require('../../db/database');


exports.getPanels = () => {
    return db.prepare('SELECT * FROM panel_templates ORDER BY name').all();
};

exports.getPanelById = (id) => {
    return db.prepare('SELECT * FROM panel_templates WHERE id=?').get(id);
};

exports.getUsersByCompetitionId = (competitionId) => {
    return db.prepare('SELECT DISTINCT user_id FROM panel_assignments WHERE competition_id = ?').all(competitionId);
};

exports.getAssignmentById = (id, competitionId) => {
    return db.prepare('SELECT * FROM panel_assignments WHERE id=? AND competition_id=?')
        .get(id, competitionId);
};

exports.getAssignmentsForRoles = (competitionId, judgeRoleIds) => {
    const placeholders = judgeRoleIds.map(() => '?').join(',');
    return db.prepare(`
        SELECT pa.id AS assignment_id, pa.judge_role_id, u.id AS user_id, u.name, u.email
        FROM panel_assignments pa
        JOIN users u ON u.id = pa.user_id
        WHERE pa.competition_id = ? AND pa.judge_role_id IN (${placeholders})
        ORDER BY u.name
    `).all(competitionId, ...judgeRoleIds);
};

exports.getAssignmentWithInfo = (competitionId, userId, judgeRoleId) => {
    return db.prepare(`
        SELECT pa.id AS assignment_id, jr.id AS judge_role_id, jr.key AS roleKey, jr.granularity,
            jr.score_min, jr.score_max, jr.is_deduction AS isDeduction
        FROM panel_assignments pa
        JOIN judge_roles jr ON jr.id = pa.judge_role_id
        WHERE pa.competition_id = ? AND pa.user_id = ? AND pa.judge_role_id = ?
    `).get(competitionId, userId, judgeRoleId);
};

exports.getHeadJudgeAssignment = (competitionId, userId) => {
    return db.prepare(`
        SELECT pa.id AS assignment_id, jr.id AS judge_role_id, jr.score_min, jr.score_max
        FROM panel_assignments pa
        JOIN judge_roles jr ON jr.id = pa.judge_role_id
        WHERE pa.competition_id = ? AND pa.user_id = ? AND jr.key = 'head_judge'
    `).get(competitionId, userId);
};

exports.getAssignmentsForUser = (competitionId, userId) => {
    return db.prepare(`
        SELECT pa.id AS assignment_id, jr.id AS judge_role_id, jr.key, jr.name,
            jr.granularity, jr.score_min, jr.score_max, jr.is_deduction AS isDeduction
        FROM panel_assignments pa
        JOIN judge_roles jr ON jr.id = pa.judge_role_id
        WHERE pa.competition_id = ? AND pa.user_id = ?
        ORDER BY jr.key
    `).all(competitionId, userId);
};

exports.getAssignedCount = (competitionId, judgeRoleIds) => {
    const placeholders = judgeRoleIds.map(() => '?').join(',');
    return db.prepare(`
        SELECT COUNT(*) AS n FROM (
        SELECT user_id FROM panel_assignments
        WHERE competition_id = ? AND judge_role_id IN (${placeholders})
        GROUP BY user_id HAVING COUNT(DISTINCT judge_role_id) = ?
        )
    `).get(competitionId, ...judgeRoleIds, judgeRoleIds.length).n;
};

exports.getAssignmentForCompetition = (competitionId, panelTemplateId) => {
    return db.prepare(`
        SELECT pa.id AS assignment_id, u.name AS judge_name, jr.key AS role_key,
            jr.name AS role_name, jr.granularity, jr.is_deduction AS isDeduction,
            s.sort_order
        FROM panel_template_slots s
        JOIN judge_roles jr ON jr.id = s.judge_role_id
        JOIN panel_assignments pa ON pa.judge_role_id = jr.id AND pa.competition_id = ?
        JOIN users u ON u.id = pa.user_id
        WHERE s.panel_template_id = ?
        ORDER BY s.sort_order, u.name
    `).all(competitionId, panelTemplateId);
};

exports.getOrderedPanelSlots = (panelTemplateId) => {
    return db.prepare(`
        SELECT s.judge_role_id AS judgeRoleId, s.judge_count AS judgeCount,
            s.shared_assignment_group AS sharedGroup, jr.name AS roleName, jr.key AS roleKey
        FROM panel_template_slots s
        JOIN judge_roles jr ON jr.id = s.judge_role_id
        WHERE s.panel_template_id = ?
        ORDER BY s.sort_order
    `).all(panelTemplateId);
};

exports.getOrderedPanelSlotsWithRoleInfo = (panelTemplateId) => {
    return db.prepare(`
        SELECT s.judge_role_id AS judgeRoleId, s.judge_count AS judgeCount, s.drop_high AS dropHigh,
            s.drop_low AS dropLow, s.combine, s.multiplier, s.aggregation,
            jr.key AS judgeRoleKey, jr.name AS judgeRoleName, jr.granularity,
            jr.is_deduction AS isDeduction, jr.max_value AS maxValue
        FROM panel_template_slots s
        JOIN judge_roles jr ON jr.id = s.judge_role_id
        WHERE s.panel_template_id = ?
        ORDER BY s.sort_order
    `).all(panelTemplateId);
};

exports.checkAlreadyAssigned = (competitionId, userId, judgeRoleIds) => {
    return db.prepare(
        'SELECT 1 FROM panel_assignments WHERE competition_id = ? AND user_id = ? AND judge_role_id NOT IN (' +
        judgeRoleIds.map(() => '?').join(',') + ')'
    ).get(competitionId, userId, ...judgeRoleIds);
};

exports.addAssignment = (competitionId, userId, judgeRoleIds) => {
    const insert = db.prepare('INSERT INTO panel_assignments (competition_id,judge_role_id,user_id) VALUES (?,?,?)');
    db.transaction(() => {
        for (const roleId of judgeRoleIds) insert.run(competitionId, roleId, userId);
    })();
};

exports.removeAssignment = (competitionId, assignmentId) => {
    db.prepare('DELETE FROM panel_assignments WHERE id=? AND competition_id=?').run(assignmentId, competitionId);
};

exports.removeAssignmentGroup = (competitionId, userId, judgeRoleIds) => {
    const placeholders = judgeRoleIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM panel_assignments WHERE competition_id=? AND user_id=? AND judge_role_id IN (${placeholders})`)
    .run(competitionId, userId, ...judgeRoleIds);
}