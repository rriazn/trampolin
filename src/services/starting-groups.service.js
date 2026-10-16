const { getGroupById } = require('./db/groups.crud');
const { getRoundsByGroup, getRoundByIdWithCompGroupInfo } = require('./db/rounds.crud');
const { getRoundAttemptCount, getAttemptContext } = require('./db/entries.crud');
const { getStartingGroupMembers, getStartingGroupRoundStatuses, getStartingGroupById } = require('./db/starting-groups.crud');

const ERROR_PREFIX = 'admin:startingGroups.errors.';

// the rounds that run together with this one, in starting group order, or just the round itself
exports.getRunRounds = (round) => {
    const group = getGroupById(round.group_id);
    if (!group?.starting_group_id) return [round];

    const position = getRoundsByGroup(group.id).findIndex(r => r.id === round.id);
    if (position < 0) return [round];

    const runRounds = [];
    for (const member of getStartingGroupMembers(group.starting_group_id)) {
        const paired = getRoundsByGroup(member.id)[position];
        if (paired) runRounds.push(paired);
    }
    return runRounds.length ? runRounds : [round];
};

exports.isMembershipLocked = (startingGroup) => {
    return getStartingGroupRoundStatuses(startingGroup.id).includes('in_progress');
};

exports.isGroupStructureLocked = (groupId) => {
    return !!getGroupById(groupId)?.starting_group_id;
};

// rounds of a group as comparable positions: attempt count and status per round
const describeRounds = (groupId) => getRoundsByGroup(groupId).map(r => ({
    attempts: getRoundAttemptCount(r.id), status: r.status,
}));

// returns an i18n error key when the group may not join, otherwise null
exports.checkCanJoin = (group, startingGroup) => {
    if (group.competition_id !== startingGroup.competition_id) return ERROR_PREFIX + 'otherCompetition';
    if (group.starting_group_id) return ERROR_PREFIX + 'alreadyGrouped';

    const own = describeRounds(group.id);
    if (own.length === 0) return ERROR_PREFIX + 'noRounds';
    if (own.some(r => r.attempts === 0)) return ERROR_PREFIX + 'noAttempts';
    if (own.some(r => r.status === 'in_progress') || exports.isMembershipLocked(startingGroup)) return ERROR_PREFIX + 'inProgress';

    const [first] = getStartingGroupMembers(startingGroup.id);
    if (!first) return null;
    const existing = describeRounds(first.id);
    if (existing.length !== own.length || existing.some((r, i) => r.attempts !== own[i].attempts)) return ERROR_PREFIX + 'notMatching';
    if (existing.some((r, i) => r.status !== own[i].status)) return ERROR_PREFIX + 'statusMismatch';
    return null;
};

// the round (with group info) that owns the current attempt, which is another member round when the athlete is from another group
exports.getCurrentRound = (round) => {
    const fresh = getRoundByIdWithCompGroupInfo(round.id, round.group_id) || round;
    const ctx = fresh.current_attempt_id ? getAttemptContext(fresh.current_attempt_id) : null;
    if (!ctx || ctx.roundId === fresh.id) return fresh;
    return getRoundByIdWithCompGroupInfo(ctx.roundId, ctx.groupId) || fresh;
};

// name and member groups of the starting group a round belongs to, or null when it runs alone
exports.getStartingGroupInfo = (round) => {
    const group = getGroupById(round.group_id);
    if (!group?.starting_group_id) return null;
    return {
        name: getStartingGroupById(group.starting_group_id).name,
        groups: getStartingGroupMembers(group.starting_group_id),
    };
};

// dashboard rows of rounds that run together become one row, kept at the place of the first member
exports.collapseByStartingGroup = (rows) => {
    const collapsed = new Map();
    for (const row of rows) {
        const group = getGroupById(row.group_id);
        if (!group?.starting_group_id) {
            collapsed.set(`round-${row.id}`, row);
            continue;
        }
        const position = getRoundsByGroup(group.id).findIndex(r => r.id === row.id);
        const key = `sg-${group.starting_group_id}-${position}`;
        if (!collapsed.has(key)) {
            collapsed.set(key, { ...row, startingGroupName: getStartingGroupById(group.starting_group_id).name, memberGroups: [], firstOrder: group.starting_group_position });
        }
        const entry = collapsed.get(key);
        entry.memberGroups.push({ name: group.name, position: group.starting_group_position });
        // the card links to the member that comes first in the starting group
        if (group.starting_group_position < entry.firstOrder) Object.assign(entry, row, { firstOrder: group.starting_group_position });
    }
    return [...collapsed.values()].map(r => {
        if (!r.memberGroups) return r;
        r.memberGroups.sort((a, b) => a.position - b.position);
        r.memberGroupNames = r.memberGroups.map(g => g.name);
        return r;
    });
};
