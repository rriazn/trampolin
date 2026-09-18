const { computeAttemptScore } = require("./scoring.service");
const { loadPanelSlots } = require("./panels.service");
const { getDetailedEntryRows } = require("./db/entries.crud");
const { getAttemptScoreRows, getElementScoreRows, getPerJudgeElementScoreRows } = require("./db/scores.crud");

function buildScoreMaps(scoreRows) {
    const scoresByAttempt = new Map();
    for (const row of scoreRows) {
        if (!scoresByAttempt.has(row.attempt_id)) scoresByAttempt.set(row.attempt_id, new Map());
        const byRole = scoresByAttempt.get(row.attempt_id);
        if (!byRole.has(row.judge_role_id)) byRole.set(row.judge_role_id, []);
        byRole.get(row.judge_role_id).push(row.score);
    }
    return scoresByAttempt;
}

function buildElementScoreMaps(elementScoreRows) {
    const elementScoresByAttempt = new Map();
    for (const row of elementScoreRows) {
        if (!elementScoresByAttempt.has(row.attempt_id)) elementScoresByAttempt.set(row.attempt_id, new Map());
        const byRole = elementScoresByAttempt.get(row.attempt_id);
        if (!byRole.has(row.judge_role_id)) byRole.set(row.judge_role_id, new Map());
        const byElement = byRole.get(row.judge_role_id);
        if (!byElement.has(row.element_number)) byElement.set(row.element_number, []);
        byElement.get(row.element_number).push(row.value);
    }
    return elementScoresByAttempt;
}

function buildElementDetailMaps(elementDetailRows) {
    const detailByAttempt = new Map();
    const elementScoresByAssignmentAttempt = new Map();
    for (const row of elementDetailRows) {
        if (!detailByAttempt.has(row.attempt_id)) detailByAttempt.set(row.attempt_id, new Map());
        const byRole = detailByAttempt.get(row.attempt_id);
        if (!byRole.has(row.judge_role_id)) byRole.set(row.judge_role_id, new Map());
        const byJudge = byRole.get(row.judge_role_id);
        if (!byJudge.has(row.judge_name)) byJudge.set(row.judge_name, new Map());
        byJudge.get(row.judge_name).set(row.element_number, row.value);

        if (!elementScoresByAssignmentAttempt.has(row.attempt_id)) elementScoresByAssignmentAttempt.set(row.attempt_id, new Map());
        const byRoleAssignment = elementScoresByAssignmentAttempt.get(row.attempt_id);
        if (!byRoleAssignment.has(row.judge_role_id)) byRoleAssignment.set(row.judge_role_id, new Map());
        const byAssignment = byRoleAssignment.get(row.judge_role_id);
        if (!byAssignment.has(row.panel_assignment_id)) byAssignment.set(row.panel_assignment_id, new Map());
        byAssignment.get(row.panel_assignment_id).set(row.element_number, row.value);
    }
    return { detailByAttempt, elementScoresByAssignmentAttempt };
}

function buildPerTrickDetail(panelSlots, roleDetail) {
    return panelSlots
        .filter(slot => slot.granularity === 'element')
        .map(slot => {
            const byJudge = roleDetail.get(slot.judgeRoleId) || new Map();
            if (byJudge.size === 0) return null;
            const elementNumbers = [...new Set([...byJudge.values()].flatMap(m => [...m.keys()]))].sort((a, b) => a - b);
            const judges = [...byJudge.entries()].map(([name, values]) => ({
                name,
                values: elementNumbers.map(n => values.has(n) ? values.get(n) : null),
            }));
            return { roleKey: slot.judgeRoleKey, roleName: slot.judgeRoleName, isDeduction: slot.isDeduction, elementNumbers, judges };
        })
        .filter(Boolean);
}

function buildSportsmenAttempts(entryRows, panelSlots, scoresByAttempt, elementScoresByAttempt, detailByAttempt, elementScoresByAssignmentAttempt) {
    const map = new Map();
    for (const row of entryRows) {
        if (!map.has(row.sportsman_id)) {
            map.set(row.sportsman_id, {
                name: row.sportsman_name,
                club: row.club,
                group: row.group_name,
                startOrder: row.start_order,
                attempts: []
            });
        }
        const sp = map.get(row.sportsman_id);
        const scoresByJudgeRoleId = scoresByAttempt.get(row.attempt_id) || new Map();
        const elementScoresByJudgeRoleId = elementScoresByAttempt.get(row.attempt_id) || new Map();
        const hasAnyScore = scoresByJudgeRoleId.size > 0 || elementScoresByJudgeRoleId.size > 0;
        const elementScoresByAssignment = elementScoresByAssignmentAttempt.get(row.attempt_id) || new Map();
        const result = panelSlots.length > 0
            ? computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, row.element_count, elementScoresByAssignment)
            : { total: 0, breakdown: [], isComplete: false };

        const roleDetail = detailByAttempt.get(row.attempt_id) || new Map();

        sp.attempts.push({
            number: row.attempt_number,
            finalScore: hasAnyScore ? result.total : null,
            breakdown: result.breakdown,
            isComplete: result.isComplete,
            perTrickDetail: buildPerTrickDetail(panelSlots, roleDetail),
        });
    }
    return map;
}

function buildLeaderboardRows(sportsmenMap) {
    const leaderboard = [];
    for (const [id, sp] of sportsmenMap) {
        const attemptScores = [...sp.attempts].sort((a, b) => a.number - b.number);

        leaderboard.push({ sportsmanId: id, name: sp.name, club: sp.club, group: sp.group, startOrder: sp.startOrder, attempts: attemptScores });
    }
    return leaderboard;
}

function sortAndRankLeaderboard(leaderboard, scoringMode) {
    if (scoringMode === 'sum') {
        for (const row of leaderboard) {
            const validScores = row.attempts.filter(a => a.finalScore !== null).map(a => a.finalScore);
            row.total = validScores.length > 0 ? validScores.reduce((sum, s) => sum + s, 0) : null;
            row.bestScore = validScores.length > 0 ? Math.max(...validScores) : null;
        }
        leaderboard.sort((a, b) => {
            if (b.total === null && a.total === null) return a.startOrder - b.startOrder;
            if (b.total === null) return -1;
            if (a.total === null) return 1;
            if (b.total !== a.total) return b.total - a.total;
            // Tiebreak: use best individual attempt
            return b.bestScore - a.bestScore;
        });
    } else {
        for (const row of leaderboard) {
            const validScores = row.attempts.filter(a => a.finalScore !== null).map(a => a.finalScore);
            row.total = validScores.length > 0 ? Math.max(...validScores) : null;
            row.secondScore = validScores.length > 1 ? [...validScores].sort((a, b) => b - a)[1] : null;
        }

        leaderboard.sort((a, b) => {
            if (b.total === null && a.total === null) return a.startOrder - b.startOrder;
            if (b.total === null) return -1;
            if (a.total === null) return 1;
            if (b.total !== a.total) return b.total - a.total;
            return (b.secondScore ?? -1) - (a.secondScore ?? -1);
        });
    }
    let rank = 1;
    for (let i = 0; i < leaderboard.length; i++) {
        if (leaderboard[i].total === null) {
            leaderboard[i].rank = '–';
        } else {
            if (i > 0 && leaderboard[i].total !== leaderboard[i - 1].total) rank = i + 1;
            leaderboard[i].rank = rank;
        }
    }
    return leaderboard;
}

exports.buildLeaderboard = (competition, round) => {
    const panelSlots = loadPanelSlots(competition.panel_template_id);

    const entryRows = getDetailedEntryRows(round.id);
    const scoreRows = getAttemptScoreRows(round.id);
    const elementScoreRows = getElementScoreRows(round.id);
    // Raw per-judge per-trick values for the audit table, separate from the combined breakdown above
    const elementDetailRows = getPerJudgeElementScoreRows(round.id);

    const scoresByAttempt = buildScoreMaps(scoreRows);
    const elementScoresByAttempt = buildElementScoreMaps(elementScoreRows);
    const { detailByAttempt, elementScoresByAssignmentAttempt } = buildElementDetailMaps(elementDetailRows);

    const sportsmenMap = buildSportsmenAttempts(
        entryRows, panelSlots, scoresByAttempt, elementScoresByAttempt, detailByAttempt, elementScoresByAssignmentAttempt
    );

    const leaderboard = sortAndRankLeaderboard(buildLeaderboardRows(sportsmenMap), round.scoring_mode);
    const maxAttempts = leaderboard.reduce((max, row) => Math.max(max, row.attempts.length), 0);

    return { leaderboard, maxAttempts, panelSlots };
};
