const {
  removeAssignment, removeAssignmentGroup, getOrderedPanelSlotsWithRoleInfo, getOrderedPanelSlots,
  getAssignedCount, getPanelById, getUsersByCompetitionId, getAssignmentsForRoles,
} = require("./db/panels.crud");
const { getUsersByRole } = require("./db/users.crud");


exports.loadPanelSlots = (panelTemplateId) => {
  if (!panelTemplateId) return [];
  return getOrderedPanelSlotsWithRoleInfo(panelTemplateId);
};

// Groups a panel template's slots by shared_assignment_group
exports.groupPanelSlots = (panelTemplateId) => {
  const slots = getOrderedPanelSlots(panelTemplateId);

  const groups = new Map();
  for (const slot of slots) {
    const groupKey = slot.sharedGroup || `solo_${slot.judgeRoleId}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { groupKey, judgeRoleIds: [], names: [], required: slot.judgeCount, roleKey: slot.roleKey });
    }
    const group = groups.get(groupKey);
    group.judgeRoleIds.push(slot.judgeRoleId);
    group.names.push(slot.roleName);
  }
  return [...groups.values()];
};

exports.rosterReadiness = (competitionId, panelTemplateId) => {
  if (!panelTemplateId) return { isReady: false, groups: [] };

  const slots = getOrderedPanelSlots(panelTemplateId);

  const groupMap = new Map();
  for (const slot of slots) {
    const key = slot.sharedGroup || `solo_${slot.judgeRoleId}`;
    if (!groupMap.has(key)) groupMap.set(key, { roleIds: [], names: [], required: slot.judgeCount });
    const group = groupMap.get(key);
    group.roleIds.push(slot.judgeRoleId);
    group.names.push(slot.roleName);
  }

  const groups = [...groupMap.values()].map(group => {
    const assignedCount = getAssignedCount(competitionId, group.roleIds);
    return { name: group.names.join(' & '), required: group.required, assignedCount, isReady: assignedCount >= group.required };
  });

  return { isReady: groups.every(g => g.isReady), groups };
};

exports.resolveAssignmentGroup = (panelTemplateId, judgeRoleId) => {
  return exports.groupPanelSlots(panelTemplateId).find(g => g.judgeRoleIds.includes(judgeRoleId));
};

exports.getJudgesForCompetition = (competition) => {
    const panelTemplate = getPanelById(competition.panel_template_id);
    const groups = exports.groupPanelSlots(competition.panel_template_id);
    
    // A user may only hold one role (one shared-assignment group) per competition, so anyone
    // already assigned to ANY role here is ineligible for every other role's candidate list.
    const assignedAnywhereIds = new Set(
        getUsersByCompetitionId(competition.id).map(u => u.user_id)
    );

    const roles = groups.map(group => {
        const rows = getAssignmentsForRoles(competition.id, group.judgeRoleIds);

        const byUser = new Map();
        for (const row of rows) {
        if (!byUser.has(row.user_id)) byUser.set(row.user_id, { user_id: row.user_id, name: row.name, email: row.email, assignment_id: row.assignment_id, roleIds: new Set() });
        byUser.get(row.user_id).roleIds.add(row.judge_role_id);
        }
        // Only users covering EVERY role in the group count as fully assigned to it.
        const assigned = [...byUser.values()].filter(u => u.roleIds.size === group.judgeRoleIds.length);
        const eligibleRole = group.roleKey === 'head_judge' ? 'head_judge' : 'referee';
        const candidates = getUsersByRole(eligibleRole).filter(u => !assignedAnywhereIds.has(u.id));

        return {
            groupKey: group.groupKey,
            judgeRoleId: group.judgeRoleIds[0], // representative id posted back on assign
            name: group.names.join(' & '),
            required: group.required,
            assigned,
            candidates,
        };
    });
    return { panelTemplate, groups: roles };
};

exports.removeJudgeFromRole = (group, assignmentId, competitionId, userId) => {
    if (group) {
        removeAssignmentGroup(competitionId, userId, group.judgeRoleIds);
    } else {
        removeAssignment(competitionId, assignmentId);
    }
}
