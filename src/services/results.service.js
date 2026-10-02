const { getAssignmentForCompetition } = require("./db/panels.crud");
const { groupPanelSlots } = require("./panels.service");
const { buildLeaderboard } = require("./leaderboard.service");
const { keptIndices } = require("./scoring.service");
const { getGroupsByCompetition } = require("./db/groups.crud");
const { getRoundsByGroup } = require("./db/rounds.crud");

const RESULTS_VERSION = 1;
// short role letters in the judge labels and the summary line, the same in every language
exports.ROLE_LETTERS = {
    execution: 'E',
    execution_t1: 'E',
    execution_t2: 'E',
    difficulty: 'D',
    time_of_flight: 'T',
    horizontal_displacement: 'H',
    synchronisation: 'S',
    synchronisation_skill: 'S',
    head_judge: 'P',
};
const LABEL_KEYS = [
    'title', 'generated', 'groups', 'group', 'place', 'round', 'rank', 'attempt', 'total', 'roundTotal',
    'skills', 'landing', 'bonus', 'missingSkill', 'skipped', 'pending', 'judges',
];

const NUMBER_FORMATS = new Map();

// score as a string in the language of the document, one to three fraction digits
exports.formatScore = (value, lng) => {
    if (value === null || value === undefined) return null;
    if (!NUMBER_FORMATS.has(lng)) {
        NUMBER_FORMATS.set(lng, new Intl.NumberFormat(lng, { minimumFractionDigits: 1, maximumFractionDigits: 3, useGrouping: false }));
    }
    // round first so a tiny negative value cannot print as negative zero, adding 0 turns -0 into 0
    return NUMBER_FORMATS.get(lng).format(Math.round(value * 1000) / 1000 + 0);
};

// judge labels per assignment (E1, D1, ...) and the judges page, numbered per role letter in panel order
exports.buildJudgeIndex = (competition, t) => {
    const assignments = getAssignmentForCompetition(competition.id, competition.panel_template_id);

    const countByLetter = new Map();
    const labelByAssignment = new Map();
    for (const a of assignments) {
        const letter = exports.ROLE_LETTERS[a.role_key];
        const number = (countByLetter.get(letter) || 0) + 1;
        countByLetter.set(letter, number);
        labelByAssignment.set(a.assignment_id, { label: `${letter}${number}`, order: labelByAssignment.size });
    }

    // a shared assignment group (e.g. horizontal displacement and synchronisation) is one person on one line
    const judges = groupPanelSlots(competition.panel_template_id).map(group => {
        const members = new Map();
        for (const a of assignments.filter(x => group.roleKeys.includes(x.role_key))) {
            if (!members.has(a.user_id)) members.set(a.user_id, { labels: [], name: a.judge_name });
            members.get(a.user_id).labels.push(labelByAssignment.get(a.assignment_id).label);
        }
        return {
            label: group.roleKeys.map(key => t(`common:judgeRoles.${key}`)).join(' & '),
            members: [...members.values()].map(m => ({ label: m.labels.join(' / '), name: m.name })),
        };
    });

    return { labelByAssignment, judges };
};

const pad = (n) => String(n).padStart(2, '0');

function formatTimestamp(now, lng) {
    const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    const day = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
    return lng === 'de' ? `${day} ${time}` : `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${time}`;
}

// one row per element role: a deduction per trick, or each judge's own total
function buildRow(slot, entry, letter, labelByAssignment, lng) {
    if (slot.aggregation === 'per_judge') {
        const judges = entry.perJudge
            .filter(pj => pj.value !== null)
            .sort((a, b) => labelByAssignment.get(a.assignmentId).order - labelByAssignment.get(b.assignmentId).order);
        const kept = keptIndices(judges.map(pj => pj.value), slot.dropHigh, slot.dropLow);
        return {
            kind: 'judges', roleKey: slot.judgeRoleKey, label: letter,
            judges: judges.map((pj, i) => ({
                label: labelByAssignment.get(pj.assignmentId).label,
                value: exports.formatScore(pj.value, lng),
                dropped: !kept.has(i),
            })),
            total: exports.formatScore(entry.value, lng),
        };
    }
    const format = (item) => (item ? exports.formatScore(item.value, lng) : null);
    return {
        kind: 'tricks', roleKey: slot.judgeRoleKey, label: letter,
        tricks: entry.perTrick.filter(p => !p.isLanding && !p.isBonus && !p.isMissingSkill).map(format),
        landing: format(entry.perTrick.find(p => p.isLanding)),
        bonus: format(entry.perTrick.find(p => p.isBonus)),
        missingSkill: format(entry.perTrick.find(p => p.isMissingSkill)),
        total: exports.formatScore(entry.value, lng),
    };
}

function buildAttempt(attempt, panelSlots, labelByAssignment, t, lng) {
    const base = { number: attempt.number, status: attempt.status, elementCount: attempt.elementCount, rows: [], summary: [], final: null };
    if (attempt.status !== 'scored') return base;

    const summary = new Map();
    panelSlots.forEach((slot, i) => {
        const entry = attempt.breakdown[i];
        const letter = exports.ROLE_LETTERS[slot.judgeRoleKey];
        if (slot.granularity === 'element') base.rows.push(buildRow(slot, entry, letter, labelByAssignment, lng));
        // roles sharing a letter (both trampolines of a synchro pair) add up to one entry
        if (!summary.has(letter)) summary.set(letter, { roleKey: slot.judgeRoleKey, label: letter, value: 0 });
        summary.get(letter).value += entry.value;
    });
    base.summary = [...summary.values()].map(item => ({ ...item, value: exports.formatScore(item.value, lng) }));
    base.final = exports.formatScore(attempt.finalScore, lng);
    return base;
}

function buildGroup(competition, group, labelByAssignment, t, lng) {
    const competitors = new Map();
    getRoundsByGroup(group.id).forEach((round, roundIndex) => {
        const { leaderboard, panelSlots } = buildLeaderboard(competition, round);
        for (const row of leaderboard) {
            if (!competitors.has(row.sportsmanId)) {
                competitors.set(row.sportsmanId, { name: row.name, club: row.club, rounds: [] });
            }
            const competitor = competitors.get(row.sportsmanId);
            competitor.lastRoundIndex = roundIndex;
            competitor.lastRank = typeof row.rank === 'number' ? row.rank : Infinity;
            competitor.startOrder = row.startOrder;
            competitor.rounds.push({
                name: round.name,
                scoringMode: round.scoring_mode,
                total: exports.formatScore(row.total, lng),
                rank: row.rank,
                attempts: row.attempts.map(a => buildAttempt(a, panelSlots, labelByAssignment, t, lng)),
            });
        }
    });

    const ordered = [...competitors.values()].sort((a, b) =>
        b.lastRoundIndex - a.lastRoundIndex || a.lastRank - b.lastRank || a.startOrder - b.startOrder);
    // same last round and same rank share a place, like the leaderboard, and the next place is skipped
    let place = 1;
    const competitorsWithPlace = ordered.map((c, i) => {
        const previous = ordered[i - 1];
        if (previous && (previous.lastRoundIndex !== c.lastRoundIndex || previous.lastRank !== c.lastRank)) place = i + 1;
        return { place: c.lastRank === Infinity ? '–' : place, name: c.name, club: c.club, rounds: c.rounds };
    });
    return { name: group.name, abbreviation: group.abbreviation, competitors: competitorsWithPlace };
}

// everything a results template needs as one JSON object, every score already formatted for the language
exports.buildResultsData = (competition, t, lng, now = new Date()) => {
    const { labelByAssignment, judges } = exports.buildJudgeIndex(competition, t);
    const groups = getGroupsByCompetition(competition.id)
        .map(group => buildGroup(competition, group, labelByAssignment, t, lng))
        .filter(group => group.competitors.length > 0);

    return {
        version: RESULTS_VERSION,
        generatedAt: formatTimestamp(now, lng),
        labels: Object.fromEntries(LABEL_KEYS.map(key => [key, t(`results:labels.${key}`)])),
        competition: { name: competition.name, date: competition.date, type: competition.type },
        groups,
        judges,
    };
};
