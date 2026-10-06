const { getGroupsByCompetition } = require("./db/groups.crud");
const { getRoundsByGroup } = require("./db/rounds.crud");
const { getSportsmenByGroup, getSportsmenById } = require("./db/sportsmen.crud");
const { rankGroupCompetitors, formatScore, formatTimestamp } = require("./results.service");

const CERTIFICATES_VERSION = 1;
const LABEL_KEYS = ['title', 'participation', 'group', 'score', 'round', 'with', 'date'];

// a synchro pair is one row with two athletes, so it makes two pages
const athletesOf = (sportsman) => (sportsman.partner_name ? 2 : 1);

// a group is ready when all its rounds are completed (at least one), or when the competition is closed
const isGroupReady = (competition, rounds) =>
    competition.status === 'closed' || (rounds.length > 0 && rounds.every(r => r.status === 'completed'));

// readiness of one group, the group routes need only this one
exports.groupReadinessFor = (competition, group) => {
    const rounds = getRoundsByGroup(group.id);
    const ready = isGroupReady(competition, rounds);
    const participantCount = getSportsmenByGroup(group.id).reduce((sum, s) => sum + athletesOf(s), 0);
    return {
        id: group.id, name: group.name, abbreviation: group.abbreviation, ready, roundCount: rounds.length, participantCount,
        downloadable: ready && participantCount > 0,
    };
};

exports.groupReadiness = (competition) => getGroupsByCompetition(competition.id).map(group => exports.groupReadinessFor(competition, group));

// every fixed text of the document in the language of t, the ordinal place text is built per certificate
exports.buildCertificateLabels = (t) => Object.fromEntries(LABEL_KEYS.map(key => [key, t(`certificates:labels.${key}`)]));

// 2026-10-02 as 02.10.2026 in German, unchanged otherwise
const formatDate = (date, lng) => {
    if (!date) return null;
    const [year, month, day] = date.split('-');
    return lng === 'de' && day ? `${day}.${month}.${year}` : date;
};

// one page per athlete, the athlete first and the partner second
function pagesOf(sportsman, result) {
    const own = { name: sportsman.name, club: sportsman.club || null };
    if (!sportsman.partner_name) return [{ ...own, partner: null, ...result }];
    const partner = { name: sportsman.partner_name, club: sportsman.partner_club || null };
    return [{ ...own, partner, ...result }, { ...partner, partner: own, ...result }];
}

const noResult = { place: null, placeText: null, score: null, round: null };

// everything a certificates template needs as one JSON object, every score already formatted for the language
exports.buildCertificatesData = (competition, group, t, lng, now = new Date()) => {
    const sportsmen = new Map(getSportsmenByGroup(group.id).map(s => [s.id, s]));

    const certificates = [];
    for (const competitor of rankGroupCompetitors(competition, group)) {
        // an athlete with an entry here who was moved to another group since is still read from the athlete row, not from the combined leaderboard name
        const sportsman = sportsmen.get(competitor.sportsmanId) || getSportsmenById(competitor.sportsmanId) || { name: competitor.name, club: competitor.club };
        sportsmen.delete(competitor.sportsmanId);
        const last = competitor.rounds[competitor.rounds.length - 1];
        const score = formatScore(last.row.total, lng);
        const result = score === null ? noResult : {
            place: competitor.place,
            placeText: t('certificates:labels.place', { count: competitor.place, ordinal: true }),
            score,
            round: last.round.name,
        };
        certificates.push(...pagesOf(sportsman, result));
    }
    // athletes of the group without an entry get a page without a result
    for (const sportsman of sportsmen.values()) certificates.push(...pagesOf(sportsman, noResult));

    return {
        version: CERTIFICATES_VERSION,
        generatedAt: formatTimestamp(now, lng),
        labels: exports.buildCertificateLabels(t),
        competition: { name: competition.name, date: formatDate(competition.date, lng) },
        group: { name: group.name, abbreviation: group.abbreviation },
        certificates,
    };
};
