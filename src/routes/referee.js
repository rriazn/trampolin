const router = require('express').Router();
const { requireReferee } = require('../middleware/auth');
const db = require('../db/database');
const { computeAttemptScore } = require('../utils/scoring');

router.use(requireReferee);

function getAttemptContext(attemptId) {
  return db.prepare(`
    SELECT a.id AS attemptId, a.element_count AS elementCount,
           r.id AS roundId, g.id AS groupId, g.competition_id AS competitionId
    FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    JOIN rounds r ON r.id = e.round_id
    JOIN groups g ON g.id = r.group_id
    WHERE a.id = ?
  `).get(attemptId);
}

function findAssignment(competitionId, userId, judgeRoleId) {
  return db.prepare(`
    SELECT pa.id AS assignment_id, jr.id AS judge_role_id, jr.granularity, jr.score_min, jr.score_max,
           jr.is_deduction AS isDeduction
    FROM panel_assignments pa
    JOIN judge_roles jr ON jr.id = pa.judge_role_id
    WHERE pa.competition_id = ? AND pa.user_id = ? AND pa.judge_role_id = ?
  `).get(competitionId, userId, judgeRoleId);
}

function isWithinRange(value, assignment) {
  if (value < assignment.score_min) return false;
  if (assignment.score_max !== null && value > assignment.score_max) return false;
  return true;
}

function rangeErrorMessage(assignment) {
  return assignment.score_max !== null
    ? `Score must be between ${assignment.score_min} and ${assignment.score_max}.`
    : `Score must be at least ${assignment.score_min}.`;
}

function loadPanelSlots(competitionId) {
  const competition = db.prepare('SELECT panel_template_id FROM competitions WHERE id=?').get(competitionId);
  if (!competition || !competition.panel_template_id) return [];
  return db.prepare(`
    SELECT s.judge_role_id AS judgeRoleId, s.judge_count AS judgeCount, s.drop_high AS dropHigh,
           s.drop_low AS dropLow, s.combine, s.multiplier,
           jr.key AS judgeRoleKey, jr.name AS judgeRoleName, jr.granularity,
           jr.is_deduction AS isDeduction, jr.max_value AS maxValue
    FROM panel_template_slots s
    JOIN judge_roles jr ON jr.id = s.judge_role_id
    WHERE s.panel_template_id = ?
    ORDER BY s.sort_order
  `).all(competition.panel_template_id);
}

function loadAttemptScoreMaps(attemptId) {
  const scoresByJudgeRoleId = new Map();
  for (const row of db.prepare('SELECT judge_role_id, score FROM scores WHERE attempt_id=?').all(attemptId)) {
    if (!scoresByJudgeRoleId.has(row.judge_role_id)) scoresByJudgeRoleId.set(row.judge_role_id, []);
    scoresByJudgeRoleId.get(row.judge_role_id).push(row.score);
  }
  const elementScoresByJudgeRoleId = new Map();
  for (const row of db.prepare('SELECT judge_role_id, element_number, value FROM element_scores WHERE attempt_id=?').all(attemptId)) {
    if (!elementScoresByJudgeRoleId.has(row.judge_role_id)) elementScoresByJudgeRoleId.set(row.judge_role_id, new Map());
    const byElement = elementScoresByJudgeRoleId.get(row.judge_role_id);
    if (!byElement.has(row.element_number)) byElement.set(row.element_number, []);
    byElement.get(row.element_number).push(row.value);
  }
  return { scoresByJudgeRoleId, elementScoresByJudgeRoleId };
}

function recomputeAttemptCompletion(attemptId, competitionId) {
  const attempt = db.prepare('SELECT element_count FROM attempts WHERE id=?').get(attemptId);
  const panelSlots = loadPanelSlots(competitionId);
  const { scoresByJudgeRoleId, elementScoresByJudgeRoleId } = loadAttemptScoreMaps(attemptId);
  const result = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count);
  db.prepare("UPDATE attempts SET status=? WHERE id=?").run(result.isComplete ? 'scored' : 'pending', attemptId);
}

router.get('/', (req, res) => {
  const userId = req.session.user.id;
  const rounds = db.prepare(`
    SELECT DISTINCT r.id, r.name, r.round_order,
           g.id AS group_id, g.name AS group_name,
           c.id AS competition_id, c.name AS competition_name
    FROM rounds r
    JOIN groups g ON g.id = r.group_id
    JOIN competitions c ON c.id = g.competition_id
    JOIN panel_assignments pa ON pa.competition_id = c.id AND pa.user_id = ?
    WHERE r.status = 'in_progress' AND c.status = 'active'
    ORDER BY c.name, g.name, r.round_order
  `).all(userId);
  res.render('referee/dashboard', { rounds });
});

router.get('/competitions/:cid/groups/:gid/rounds/:rid', (req, res) => {
  const { cid, gid, rid } = req.params;
  const userId = req.session.user.id;

  const competition = db.prepare('SELECT id FROM competitions WHERE id = ?').get(cid);
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

  const assignments = db.prepare(`
    SELECT pa.id AS assignment_id, jr.id AS judge_role_id, jr.key, jr.name,
           jr.granularity, jr.score_min, jr.score_max, jr.is_deduction AS isDeduction
    FROM panel_assignments pa
    JOIN judge_roles jr ON jr.id = pa.judge_role_id
    WHERE pa.competition_id = ? AND pa.user_id = ?
    ORDER BY jr.key
  `).all(round.competition_id, userId);

  if (round.status !== 'in_progress' || !round.current_attempt_id) {
    return res.render('referee/round', { round, attempt: null, inputs: [], state: 'not_started' });
  }
  if (assignments.length === 0) {
    return res.render('referee/round', { round, attempt: null, inputs: [], state: 'no_assignment' });
  }

  const attempt = db.prepare(`
    SELECT a.id AS attempt_id, a.attempt_number, a.element_count,
           e.start_order, sp.name AS sportsman_name, sp.club, sp.routine
    FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    WHERE a.id = ?
  `).get(round.current_attempt_id);

  const panelSlots = loadPanelSlots(round.competition_id);
  const { scoresByJudgeRoleId, elementScoresByJudgeRoleId } = loadAttemptScoreMaps(attempt.attempt_id);
  const { breakdown } = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count);
  const breakdownByRoleId = new Map(panelSlots.map((slot, i) => [slot.judgeRoleId, breakdown[i]]));

  const inputs = assignments.map(a => {
    const contribution = breakdownByRoleId.get(a.judge_role_id) || null;
    if (a.granularity === 'element') {
      const existing = db.prepare(
        'SELECT element_number, value FROM element_scores WHERE attempt_id=? AND panel_assignment_id=?'
      ).all(attempt.attempt_id, a.assignment_id);
      const valueByElement = new Map(existing.map(e => [e.element_number, e.value]));
      const elements = [];
      for (let n = 1; n <= attempt.element_count; n++) {
        elements.push({ number: n, value: valueByElement.has(n) ? valueByElement.get(n) : null, kind: 'trick' });
      }
      // 11th line: landing deduction/bonus
      if (a.isDeduction && attempt.element_count === 10) {
        elements.push({ number: 11, value: valueByElement.has(11) ? valueByElement.get(11) : null, kind: 'landing' });
      } else if (!a.isDeduction) {
        elements.push({ number: 11, value: valueByElement.has(11) ? valueByElement.get(11) : null, kind: 'bonus' });
      }
      const hasSubmitted = existing.length > 0;
      return { ...a, elements, contribution: hasSubmitted ? contribution : null };
    }
    const existing = db.prepare(
      'SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?'
    ).get(attempt.attempt_id, a.assignment_id);
    return { ...a, score: existing ? existing.score : null, contribution: existing ? contribution : null };
  });

  res.render('referee/round', { round, attempt, inputs, state: 'active' });
});

router.post('/score', (req, res) => {
  const { attemptId, judgeRoleId, score } = req.body;
  const userId = req.session.user.id;

  const ctx = getAttemptContext(attemptId);
  if (!ctx) return res.status(404).send('Attempt not found');

  const assignment = findAssignment(ctx.competitionId, userId, judgeRoleId);
  if (!assignment) return res.status(403).send('Forbidden');
  if (assignment.granularity !== 'attempt') return res.status(400).send('This role is scored per trick, not per attempt.');

  const parsed = parseFloat(score);
  if (isNaN(parsed) || !isWithinRange(parsed, assignment)) {
    return res.status(400).send(rangeErrorMessage(assignment));
  }

  db.prepare('INSERT OR REPLACE INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
    .run(attemptId, assignment.assignment_id, assignment.judge_role_id, parsed);

  recomputeAttemptCompletion(attemptId, ctx.competitionId);

  req.session.flash = { success: `Score ${parsed.toFixed(1)} saved.` };
  res.redirect(`/referee/competitions/${ctx.competitionId}/groups/${ctx.groupId}/rounds/${ctx.roundId}`);
});

router.post('/score/elements', (req, res) => {
  const { attemptId, judgeRoleId } = req.body;
  const userId = req.session.user.id;

  const ctx = getAttemptContext(attemptId);
  if (!ctx) return res.status(404).send('Attempt not found');

  const assignment = findAssignment(ctx.competitionId, userId, judgeRoleId);
  if (!assignment) return res.status(403).send('Forbidden');
  if (assignment.granularity !== 'element') return res.status(400).send('This role is scored per attempt, not per trick.');

  // Non-deduction element roles (difficulty) are entered x10 for easier typing 
  const scale = assignment.isDeduction ? 1 : 10;

  const parsedValues = [];
  for (let n = 1; n <= ctx.elementCount; n++) {
    const raw = parseFloat(req.body[`element_${n}`]);
    const parsed = isNaN(raw) ? NaN : raw / scale;
    if (isNaN(parsed) || !isWithinRange(parsed, assignment)) {
      return res.status(400).send(`Trick ${n}: ${rangeErrorMessage(assignment)}`);
    }
    parsedValues.push([n, parsed]);
  }

  // 11th line: landing (deduction roles, full 10-skill routines, required) or bonus (non-deduction
  // roles, always optional). Landing's range is 0-1.0, wider than a regular trick's 0-0.5 cap
  // (assignment.score_max), so it's validated against a hardcoded bound here, not that field.
  if (assignment.isDeduction && ctx.elementCount === 10) {
    const raw = parseFloat(req.body.element_11);
    if (isNaN(raw) || raw < 0 || raw > 1.0) {
      return res.status(400).send('Landing: score must be between 0 and 1.0.');
    }
    parsedValues.push([11, raw]);
  } else if (!assignment.isDeduction && req.body.element_11 !== undefined && req.body.element_11 !== '') {
    const raw = parseFloat(req.body.element_11);
    const parsed = isNaN(raw) ? NaN : raw / scale;
    if (isNaN(parsed) || !isWithinRange(parsed, assignment)) {
      return res.status(400).send(`Bonus: ${rangeErrorMessage(assignment)}`);
    }
    parsedValues.push([11, parsed]);
  }

  const upsert = db.prepare(
    'INSERT OR REPLACE INTO element_scores (attempt_id, panel_assignment_id, judge_role_id, element_number, value) VALUES (?,?,?,?,?)'
  );
  db.transaction(() => {
    for (const [n, value] of parsedValues) upsert.run(attemptId, assignment.assignment_id, assignment.judge_role_id, n, value);
  })();

  recomputeAttemptCompletion(attemptId, ctx.competitionId);

  req.session.flash = { success: 'Scores saved.' };
  res.redirect(`/referee/competitions/${ctx.competitionId}/groups/${ctx.groupId}/rounds/${ctx.roundId}`);
});

module.exports = router;
