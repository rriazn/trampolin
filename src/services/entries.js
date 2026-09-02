const { loadPanelSlots } = require("./panels");
const { computeAttemptScore } = require("./scoring");
const { getEntryAttemptRows, getEntryIdsForRound, updateEntryStartOrderDB } = require("./db/entries.crud");
const { getAttemptScoreRows, getElementScoreRows } = require("./db/scores.crud");

exports.orderAvailableByPreviousRound = (competition, prevRound, available) => {
    const panelSlots = loadPanelSlots(competition.panel_template_id);

    const attemptRows = getEntryAttemptRows(prevRound.id);

    const scoreRows = getAttemptScoreRows(prevRound.id);
    const elementScoreRows = getElementScoreRows(prevRound.id);

    const scoresByAttempt = new Map();
    for (const row of scoreRows) {
        if (!scoresByAttempt.has(row.attempt_id)) 
            scoresByAttempt.set(row.attempt_id, new Map());
        const byRole = scoresByAttempt.get(row.attempt_id);
        if (!byRole.has(row.judge_role_id)) 
            byRole.set(row.judge_role_id, []);
        byRole.get(row.judge_role_id).push(row.score);
    }
    const elementScoresByAttempt = new Map();
    const elementScoresByAssignmentAttempt = new Map();
    for (const row of elementScoreRows) {
        if (!elementScoresByAttempt.has(row.attempt_id)) 
            elementScoresByAttempt.set(row.attempt_id, new Map());
        const byRole = elementScoresByAttempt.get(row.attempt_id);
        if (!byRole.has(row.judge_role_id)) 
            byRole.set(row.judge_role_id, new Map());
        const byElement = byRole.get(row.judge_role_id);
        if (!byElement.has(row.element_number)) 
            byElement.set(row.element_number, []);
        byElement.get(row.element_number).push(row.value);

        if (!elementScoresByAssignmentAttempt.has(row.attempt_id)) 
            elementScoresByAssignmentAttempt.set(row.attempt_id, new Map());
        const byRoleAssignment = elementScoresByAssignmentAttempt.get(row.attempt_id);
        if (!byRoleAssignment.has(row.judge_role_id)) 
            byRoleAssignment.set(row.judge_role_id, new Map());
        const byAssignment = byRoleAssignment.get(row.judge_role_id);
        if (!byAssignment.has(row.panel_assignment_id)) 
            byAssignment.set(row.panel_assignment_id, new Map());
        byAssignment.get(row.panel_assignment_id).set(row.element_number, row.value);
    }

    const spMap = new Map();
    for (const row of attemptRows) {
        if (!spMap.has(row.sportsman_id)) 
            spMap.set(row.sportsman_id, []);
        const scoresByJudgeRoleId = scoresByAttempt.get(row.attempt_id) || new Map();
        const elementScoresByJudgeRoleId = elementScoresByAttempt.get(row.attempt_id) || new Map();
        const hasAnyScore = scoresByJudgeRoleId.size > 0 || elementScoresByJudgeRoleId.size > 0;
        if (!hasAnyScore) 
            continue;
        const elementScoresByAssignment = elementScoresByAssignmentAttempt.get(row.attempt_id) || new Map();
        const { total } = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, row.element_count, elementScoresByAssignment);
        spMap.get(row.sportsman_id).push(total);
    }

    const ranked = [];
    for (const [spId, scores] of spMap) {
        if (prevRound.scoring_mode === 'sum') {
            ranked.push({ spId, total: scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) : null, bestScore: scores.length > 0 ? Math.max(...scores) : null });
        } else {
            ranked.push({ spId, total: scores.length > 0 ? Math.max(...scores) : null, secondScore: scores.length > 1 ? [...scores].sort((a, b) => b - a)[1] : null });
        }
    }
    if (prevRound.scoring_mode === 'sum') {
        ranked.sort((a, b) => {
            if (b.total === null && a.total === null) return 0;
            if (b.total === null) return -1;
            if (a.total === null) return 1;
            if (b.total !== a.total) return b.total - a.total;
            // Tiebreak: use best individual attempt
            return b.bestScore - a.bestScore;
        });
    } else {
        ranked.sort((a, b) => {
            if (a.total === null && b.total === null) return 0;
            if (a.total === null) return 1;
            if (b.total === null) return -1;
            if (b.total !== a.total) return b.total - a.total;
            return (b.secondScore ?? -1) - (a.secondScore ?? -1);
        });
    }
    const rankMap = new Map();
    let rank = 1;
    for (let i = 0; i < ranked.length; i++) {
        if (ranked[i].total !== null) {
            if (i > 0 && ranked[i].total !== ranked[i - 1].total) rank = i + 1;
            rankMap.set(ranked[i].spId, rank);
        }
    }

    available.forEach(s => { s.prevRank = rankMap.get(s.id) ?? null; });
    available.sort((a, b) => {
        if (a.prevRank === null && b.prevRank === null) 
            return a.name.localeCompare(b.name);
        if (a.prevRank === null) 
            return 1;
        if (b.prevRank === null) 
            return -1;
        return a.prevRank - b.prevRank;
    });
    return available
}

exports.randomizeEntryOrder = (rid) => {
    const entries = getEntryIdsForRound(rid);

    for (let i = entries.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [entries[i], entries[j]] = [entries[j], entries[i]];
    }

    updateEntryStartOrderDB(entries);
}