const router = require('express').Router();
const db = require('../db/database');
const { computeAttemptScore } = require('../utils/scoring');

function loadPanelSlots(panelTemplateId) {
  if (!panelTemplateId) return [];
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
}

router.get('/competitions/:cid/groups/:gid/rounds/:rid', (req, res) => {
  const { cid, gid, rid } = req.params;

  const competition = db.prepare('SELECT id, panel_template_id FROM competitions WHERE id = ?').get(cid);
  if (!competition) return res.status(404).send('Competition not found');

  const group = db.prepare('SELECT id FROM groups WHERE id = ? AND competition_id = ?').get(gid, cid);
  if (!group) return res.status(404).send('Group not found');

  const round = db.prepare(`
    SELECT r.*, g.id AS group_id, g.name AS group_name,
           c.id AS competition_id, c.name AS competition_name
    FROM rounds r
    JOIN groups g ON g.id = r.group_id
    JOIN competitions c ON c.id = g.competition_id
    WHERE r.id = ? AND r.group_id = ?
  `).get(rid, gid);
  if (!round) return res.status(404).send('Round not found');

  const panelSlots = loadPanelSlots(competition.panel_template_id);

  const entryRows = db.prepare(`
    SELECT
      sp.id AS sportsman_id, sp.name AS sportsman_name, sp.club,
      g.name AS group_name,
      e.start_order,
      a.id AS attempt_id, a.attempt_number, a.element_count
    FROM entries e
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    LEFT JOIN groups g ON g.id = sp.group_id
    JOIN attempts a ON a.entry_id = e.id
    WHERE e.round_id = ?
    ORDER BY sp.id, a.attempt_number
  `).all(rid);

  const scoreRows = db.prepare(`
    SELECT s.attempt_id, s.judge_role_id, s.score
    FROM scores s
    JOIN attempts a ON a.id = s.attempt_id
    JOIN entries e ON e.id = a.entry_id
    WHERE e.round_id = ?
  `).all(rid);
  const elementScoreRows = db.prepare(`
    SELECT es.attempt_id, es.judge_role_id, es.element_number, es.value
    FROM element_scores es
    JOIN attempts a ON a.id = es.attempt_id
    JOIN entries e ON e.id = a.entry_id
    WHERE e.round_id = ?
  `).all(rid);
  // Raw per-judge per-trick values for the audit table, separate from the combined breakdown above
  const elementDetailRows = db.prepare(`
    SELECT es.attempt_id, es.judge_role_id, es.panel_assignment_id, es.element_number, es.value, u.name AS judge_name
    FROM element_scores es
    JOIN attempts a ON a.id = es.attempt_id
    JOIN entries e ON e.id = a.entry_id
    JOIN panel_assignments pa ON pa.id = es.panel_assignment_id
    JOIN users u ON u.id = pa.user_id
    WHERE e.round_id = ?
    ORDER BY u.name
  `).all(rid);

  const scoresByAttempt = new Map();
  for (const row of scoreRows) {
    if (!scoresByAttempt.has(row.attempt_id)) scoresByAttempt.set(row.attempt_id, new Map());
    const byRole = scoresByAttempt.get(row.attempt_id);
    if (!byRole.has(row.judge_role_id)) byRole.set(row.judge_role_id, []);
    byRole.get(row.judge_role_id).push(row.score);
  }
  const elementScoresByAttempt = new Map();
  for (const row of elementScoreRows) {
    if (!elementScoresByAttempt.has(row.attempt_id)) elementScoresByAttempt.set(row.attempt_id, new Map());
    const byRole = elementScoresByAttempt.get(row.attempt_id);
    if (!byRole.has(row.judge_role_id)) byRole.set(row.judge_role_id, new Map());
    const byElement = byRole.get(row.judge_role_id);
    if (!byElement.has(row.element_number)) byElement.set(row.element_number, []);
    byElement.get(row.element_number).push(row.value);
  }
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
    const perTrickDetail = panelSlots
      .filter(slot => slot.granularity === 'element')
      .map(slot => {
        const byJudge = roleDetail.get(slot.judgeRoleId) || new Map();
        if (byJudge.size === 0) return null;
        const elementNumbers = [...new Set([...byJudge.values()].flatMap(m => [...m.keys()]))].sort((a, b) => a - b);
        const judges = [...byJudge.entries()].map(([name, values]) => ({
          name,
          values: elementNumbers.map(n => values.has(n) ? values.get(n) : null),
        }));
        return { roleName: slot.judgeRoleName, isDeduction: slot.isDeduction, elementNumbers, judges };
      })
      .filter(Boolean);

    sp.attempts.push({
      number: row.attempt_number,
      finalScore: hasAnyScore ? result.total : null,
      breakdown: result.breakdown,
      isComplete: result.isComplete,
      perTrickDetail,
    });
  }

  const leaderboard = [];
  for (const [id, sp] of map) {
    const attemptScores = [...sp.attempts].sort((a, b) => a.number - b.number);

    const scored = attemptScores.filter(a => a.finalScore !== null);
    const bestScore = scored.length > 0 ? Math.max(...scored.map(a => a.finalScore)) : null;
    const secondScore = scored.length > 1 ? scored.map(a => a.finalScore).filter(s => s !== bestScore)[0] ?? null : null;

    leaderboard.push({ sportsmanId: id, name: sp.name, club: sp.club, group: sp.group, startOrder: sp.startOrder, attempts: attemptScores, bestScore, secondScore });
  }

  leaderboard.sort((a, b) => {
    if (b.bestScore === null && a.bestScore === null) return a.startOrder - b.startOrder;
    if (b.bestScore === null) return -1;
    if (a.bestScore === null) return 1;
    if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
    return (b.secondScore ?? -1) - (a.secondScore ?? -1);
  });

  let rank = 1;
  for (let i = 0; i < leaderboard.length; i++) {
    if (leaderboard[i].bestScore === null) {
      leaderboard[i].rank = '–';
    } else {
      if (i > 0 && leaderboard[i].bestScore !== leaderboard[i - 1].bestScore) rank = i + 1;
      leaderboard[i].rank = rank;
    }
  }

  const maxAttempts = leaderboard.reduce((max, row) => Math.max(max, row.attempts.length), 0);

  res.render('leaderboard', {
    round,
    leaderboard,
    maxAttempts,
    autoRefresh: true,
    panelConfigured: panelSlots.length > 0,
  });
});

module.exports = router;
