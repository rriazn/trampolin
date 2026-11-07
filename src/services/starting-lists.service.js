const { getGroupsByCompetition } = require('./db/groups.crud');
const { getRoundsByGroup } = require('./db/rounds.crud');
const { getEntriesWithAttemptsInfo, countEntriesByCompetition } = require('./db/entries.crud');
const { getStartingGroupById } = require('./db/starting-groups.crud');
const { formatTimestamp, formatDate } = require('./results.service');

const STARTING_LISTS_VERSION = 1;
const LABEL_KEYS = ['title', 'group', 'round', 'startingGroup', 'position', 'name', 'club', 'birthYear', 'routine'];

const yearText = (year) => (year === null || year === undefined ? null : String(year));

// the documents card offers the download only when some round has competitors
exports.hasStartingLists = (competition) => countEntriesByCompetition(competition.id) > 0;

// every fixed text of the document in the language of t
exports.buildStartingListLabels = (t) => Object.fromEntries(LABEL_KEYS.map(key => [key, t(`startingLists:labels.${key}`)]));

// the position is counted, the stored start_order can have gaps
const competitorOf = (entry, index) => ({
    position: index + 1,
    name: entry.sportsman_name,
    club: entry.club || null,
    birthYear: yearText(entry.birth_year),
    routine: entry.routine || null,
    partner: entry.partner_name
        ? { name: entry.partner_name, club: entry.partner_club || null, birthYear: yearText(entry.partner_birth_year) }
        : null,
});

const startingGroupName = (group) => (group.starting_group_id ? getStartingGroupById(group.starting_group_id)?.name || null : null);

const roundListOf = ({ group, round, entries }) => ({
    group: { name: group.name, abbreviation: group.abbreviation },
    round: { name: round.name },
    startingGroup: startingGroupName(group),
    competitors: entries.map(competitorOf),
});

// everything a starting lists template needs as one JSON object, one item per round
const buildStartingListsData = (competition, rounds, t, lng, now) => ({
    version: STARTING_LISTS_VERSION,
    generatedAt: formatTimestamp(now, lng),
    labels: exports.buildStartingListLabels(t),
    competition: { name: competition.name, date: formatDate(competition.date, lng), type: competition.type },
    rounds: rounds.map(roundListOf),
});

exports.buildRoundStartingList = (competition, group, round, t, lng, now = new Date()) =>
    buildStartingListsData(competition, [{ group, round, entries: getEntriesWithAttemptsInfo(round.id) }], t, lng, now);

// every round with entries, group by group, rounds without entries are left out
exports.buildAllStartingLists = (competition, t, lng, now = new Date()) => {
    const rounds = getGroupsByCompetition(competition.id).flatMap(group => getRoundsByGroup(group.id)
        .map(round => ({ group, round, entries: getEntriesWithAttemptsInfo(round.id) }))
        .filter(item => item.entries.length > 0));
    return buildStartingListsData(competition, rounds, t, lng, now);
};
