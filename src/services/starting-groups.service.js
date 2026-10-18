const { getGroupById } = require('./db/groups.crud');
const { getRoundsByGroup, getRoundByIdWithCompGroupInfo } = require('./db/rounds.crud');
const { getRoundAttemptCount, getAttemptContext, getEntriesWithAttemptsInfo } = require('./db/entries.crud');
const { getStartingGroupMembers, getStartingGroupRoundStatuses, getStartingGroupById, getGroupedRounds } = require('./db/starting-groups.crud');

const ERROR_PREFIX = 'admin:startingGroups.errors.';

exports.MAX_NAME_LENGTH = 60;

// rounds in round order per group id, the groups in starting group order
const roundsByGroup = (rounds) => {
    const byGroup = new Map();
    for (const r of rounds) {
        if (!byGroup.has(r.group_id)) byGroup.set(r.group_id, []);
        byGroup.get(r.group_id).push(r);
    }
    return byGroup;
};

// the rounds that run together with this one, in starting group order, or just the round itself
exports.getRunRounds = (round) => {
    const group = getGroupById(round.group_id);
    if (!group?.starting_group_id) return [round];

    const byGroup = roundsByGroup(getGroupedRounds(group.starting_group_id));
    const position = (byGroup.get(group.id) || []).findIndex(r => r.id === round.id);
    if (position < 0) return [round];

    const runRounds = [...byGroup.values()].map(rounds => rounds[position]).filter(Boolean);
    return runRounds.length ? runRounds : [round];
};

exports.isMembershipLocked = (startingGroup) => {
    return getStartingGroupRoundStatuses(startingGroup.id).includes('in_progress');
};

exports.isGroupStructureLocked = (groupId) => {
    return !!getGroupById(groupId)?.starting_group_id;
};

// rounds of a group as comparable positions: name, attempt count, status and whether every athlete has all attempts
const describeRounds = (groupId) => getRoundsByGroup(groupId).map(r => {
    const attempts = getRoundAttemptCount(r.id);
    return {
        name: r.name.trim().toLowerCase(), attempts, status: r.status,
        complete: getEntriesWithAttemptsInfo(r.id).every(e => e.attempt_count === attempts),
    };
});

// returns an i18n error key when the group may not join, otherwise null
exports.checkCanJoin = (group, startingGroup) => {
    if (group.competition_id !== startingGroup.competition_id) return ERROR_PREFIX + 'otherCompetition';
    if (group.starting_group_id) return ERROR_PREFIX + 'alreadyGrouped';

    const own = describeRounds(group.id);
    if (own.length === 0) return ERROR_PREFIX + 'noRounds';
    if (own.some(r => r.attempts === 0)) return ERROR_PREFIX + 'noAttempts';
    if (own.some(r => !r.complete)) return ERROR_PREFIX + 'incompleteAttempts';
    if (own.some(r => r.status === 'in_progress') || exports.isMembershipLocked(startingGroup)) return ERROR_PREFIX + 'inProgress';

    const [first] = getStartingGroupMembers(startingGroup.id);
    if (!first) return null;
    const existing = describeRounds(first.id);
    if (existing.length !== own.length || existing.some((r, i) => r.attempts !== own[i].attempts)) return ERROR_PREFIX + 'notMatching';
    if (existing.some((r, i) => r.name !== own[i].name)) return ERROR_PREFIX + 'roundNames';
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
    const grouped = roundsByGroup(getGroupedRounds());
    const collapsed = new Map();
    for (const row of rows) {
        const rounds = grouped.get(row.group_id) || [];
        const position = rounds.findIndex(r => r.id === row.id);
        // a row that is not a round of a grouped group stays a card of its own
        if (position < 0) {
            collapsed.set(`round-${row.id}`, row);
            continue;
        }
        const member = rounds[position];
        const key = `sg-${member.starting_group_id}-${position}`;
        if (!collapsed.has(key)) {
            collapsed.set(key, { ...row, startingGroupName: member.starting_group_name, memberGroups: [], firstOrder: member.starting_group_position });
        }
        const entry = collapsed.get(key);
        entry.memberGroups.push({ name: member.group_name, position: member.starting_group_position });
        // the card links to the member that comes first in the starting group
        if (member.starting_group_position < entry.firstOrder) Object.assign(entry, row, { firstOrder: member.starting_group_position });
    }
    return [...collapsed.values()].map(r => {
        if (!r.memberGroups) return r;
        r.memberGroups.sort((a, b) => a.position - b.position);
        r.memberGroupNames = r.memberGroups.map(g => g.name);
        return r;
    });
};
