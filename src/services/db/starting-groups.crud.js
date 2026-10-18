const db = require('../../db/database');


exports.getStartingGroupById = (id) => {
    return db.prepare('SELECT * FROM starting_groups WHERE id=?').get(id);
};

exports.getStartingGroupMembers = (startingGroupId) => {
    return db.prepare(`
        SELECT id, name, abbreviation, starting_group_position
        FROM groups WHERE starting_group_id = ?
        ORDER BY starting_group_position, id
    `).all(startingGroupId);
};

exports.getStartingGroupsByCompetition = (competitionId) => {
    const list = db.prepare('SELECT * FROM starting_groups WHERE competition_id=? ORDER BY name').all(competitionId);
    return list.map(sg => ({ ...sg, groups: exports.getStartingGroupMembers(sg.id) }));
};

exports.getStartingGroupRoundStatuses = (startingGroupId) => {
    return db.prepare(`
        SELECT r.status FROM rounds r JOIN groups g ON g.id = r.group_id
        WHERE g.starting_group_id = ?
    `).all(startingGroupId).map(r => r.status);
};

// rounds of grouped groups with their group and starting group, one starting group or all of them
exports.getGroupedRounds = (startingGroupId) => {
    return db.prepare(`
        SELECT r.*, g.name AS group_name, g.starting_group_id, g.starting_group_position, sg.name AS starting_group_name
        FROM rounds r
        JOIN groups g ON g.id = r.group_id
        JOIN starting_groups sg ON sg.id = g.starting_group_id
        WHERE (? IS NULL OR g.starting_group_id = ?)
        ORDER BY g.starting_group_position, g.id, r.round_order, r.id
    `).all(startingGroupId ?? null, startingGroupId ?? null);
};

exports.addStartingGroupDB = (competitionId, name) => {
    return db.prepare('INSERT INTO starting_groups (competition_id, name) VALUES (?, ?)').run(competitionId, name.trim());
};

exports.deleteStartingGroupDB = (id, competitionId) => {
    db.transaction(() => {
        db.prepare('UPDATE groups SET starting_group_id=NULL, starting_group_position=NULL WHERE starting_group_id=?').run(id);
        db.prepare('DELETE FROM starting_groups WHERE id=? AND competition_id=?').run(id, competitionId);
    })();
};

exports.addGroupToStartingGroupDB = (groupId, startingGroupId) => {
    const max = db.prepare('SELECT MAX(starting_group_position) AS max FROM groups WHERE starting_group_id=?').get(startingGroupId).max;
    db.prepare('UPDATE groups SET starting_group_id=?, starting_group_position=? WHERE id=?').run(startingGroupId, (max || 0) + 1, groupId);
};

exports.removeGroupFromStartingGroupDB = (groupId) => {
    db.transaction(() => {
        const group = db.prepare('SELECT starting_group_id FROM groups WHERE id=?').get(groupId);
        if (!group?.starting_group_id) return;
        db.prepare('UPDATE groups SET starting_group_id=NULL, starting_group_position=NULL WHERE id=?').run(groupId);
        const update = db.prepare('UPDATE groups SET starting_group_position=? WHERE id=?');
        exports.getStartingGroupMembers(group.starting_group_id).forEach((g, i) => update.run(i + 1, g.id));
    })();
};

// swaps the group with its neighbour and reports whether it moved
exports.moveGroupInStartingGroupDB = (groupId, direction) => {
    return db.transaction(() => {
        const group = db.prepare('SELECT starting_group_id FROM groups WHERE id=?').get(groupId);
        if (!group?.starting_group_id) return false;
        const members = exports.getStartingGroupMembers(group.starting_group_id);
        const index = members.findIndex(g => g.id === Number(groupId));
        const other = members[direction === 'up' ? index - 1 : index + 1];
        if (index < 0 || !other) return false;
        const update = db.prepare('UPDATE groups SET starting_group_position=? WHERE id=?');
        update.run(other.starting_group_position, groupId);
        update.run(members[index].starting_group_position, other.id);
        return true;
    })();
};
