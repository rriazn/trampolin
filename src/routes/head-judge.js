'use strict';
const router = require('express').Router();
const { requireHeadJudge } = require('../middleware/auth');
const db = require('../db/database');
const { computeAttemptScore } = require('../utils/scoring');

router.use(requireHeadJudge);

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

function loadAttemptScoreMaps(attemptId) {
  const scoresByJudgeRoleId = new Map();
  for (const row of db.prepare('SELECT judge_role_id, score FROM scores WHERE attempt_id=?').all(attemptId)) {
    if (!scoresByJudgeRoleId.has(row.judge_role_id)) scoresByJudgeRoleId.set(row.judge_role_id, []);
    scoresByJudgeRoleId.get(row.judge_role_id).push(row.score);
  }
  const elementScoresByJudgeRoleId = new Map();
  const elementScoresByAssignment = new Map();
  for (const row of db.prepare('SELECT judge_role_id, panel_assignment_id, element_number, value FROM element_scores WHERE attempt_id=?').all(attemptId)) {
    if (!elementScoresByJudgeRoleId.has(row.judge_role_id)) elementScoresByJudgeRoleId.set(row.judge_role_id, new Map());
    const byElement = elementScoresByJudgeRoleId.get(row.judge_role_id);
    if (!byElement.has(row.element_number)) byElement.set(row.element_number, []);
    byElement.get(row.element_number).push(row.value);

    if (!elementScoresByAssignment.has(row.judge_role_id)) elementScoresByAssignment.set(row.judge_role_id, new Map());
    const byAssignment = elementScoresByAssignment.get(row.judge_role_id);
    if (!byAssignment.has(row.panel_assignment_id)) byAssignment.set(row.panel_assignment_id, new Map());
    byAssignment.get(row.panel_assignment_id).set(row.element_number, row.value);
  }
  return { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment };
}

// Groups a panel template's slots by shared_assignment_group (slots that must be filled by the
// same person, e.g. time_of_flight + horizontal_displacement) and checks how many people fully
// cover each group, mirroring admin.js's judges-assignment screen so "ready" here means the same
// thing it means there.
function rosterReadiness(competitionId, panelTemplateId) {
  if (!panelTemplateId) return { isReady: false, groups: [] };

  const slots = db.prepare(`
    SELECT s.judge_role_id AS judgeRoleId, s.judge_count AS judgeCount,
           s.shared_assignment_group AS sharedGroup, jr.name AS roleName
    FROM panel_template_slots s
    JOIN judge_roles jr ON jr.id = s.judge_role_id
    WHERE s.panel_template_id = ?
    ORDER BY s.sort_order
  `).all(panelTemplateId);

  const groupMap = new Map();
  for (const slot of slots) {
    const key = slot.sharedGroup || `solo_${slot.judgeRoleId}`;
    if (!groupMap.has(key)) groupMap.set(key, { roleIds: [], names: [], required: slot.judgeCount });
    const group = groupMap.get(key);
    group.roleIds.push(slot.judgeRoleId);
    group.names.push(slot.roleName);
  }

  const groups = [...groupMap.values()].map(group => {
    const placeholders = group.roleIds.map(() => '?').join(',');
    const assignedCount = db.prepare(`
      SELECT COUNT(*) AS n FROM (
        SELECT user_id FROM panel_assignments
        WHERE competition_id = ? AND judge_role_id IN (${placeholders})
        GROUP BY user_id HAVING COUNT(DISTINCT judge_role_id) = ?
      )
    `).get(competitionId, ...group.roleIds, group.roleIds.length).n;
    return { name: group.names.join(' & '), required: group.required, assignedCount, isReady: assignedCount >= group.required };
  });

  return { isReady: groups.every(g => g.isReady), groups };
}

function recomputeAttemptCompletion(attemptId, panelTemplateId) {
  const attempt = db.prepare('SELECT element_count FROM attempts WHERE id=?').get(attemptId);
  const panelSlots = loadPanelSlots(panelTemplateId);
  const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = loadAttemptScoreMaps(attemptId);
  const result = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count, elementScoresByAssignment);
  db.prepare("UPDATE attempts SET status=? WHERE id=?").run(result.isComplete ? 'scored' : 'pending', attemptId);
  return result;
}

// Per-judge (not just per-role) submission status for the current attempt — lets the head judge
// see exactly who among e.g. the 6 execution judges has and hasn't submitted yet, not just a count.
// Each judge's `value` is their own single end value in the same shape shown to the judge
// themselves (e.g. execution: elementCount minus that judge's own summed deductions, per Code of
// Points — a shortened routine's max is the number of skills actually performed, not a fixed 10)
// — not the cross-judge combined role value, and not a raw per-trick list.
function loadJudgeSubmissionStatus(panelTemplateId, competitionId, attemptId, elementCount) {
  if (!panelTemplateId) return [];
  const assignments = db.prepare(`
    SELECT pa.id AS assignment_id, u.name AS judge_name, jr.key AS role_key,
           jr.name AS role_name, jr.granularity, jr.is_deduction AS isDeduction,
           s.sort_order
    FROM panel_template_slots s
    JOIN judge_roles jr ON jr.id = s.judge_role_id
    JOIN panel_assignments pa ON pa.judge_role_id = jr.id AND pa.competition_id = ?
    JOIN users u ON u.id = pa.user_id
    WHERE s.panel_template_id = ?
    ORDER BY s.sort_order, u.name
  `).all(competitionId, panelTemplateId);

  const scoresByAssignment = new Map();
  for (const row of db.prepare('SELECT panel_assignment_id, score FROM scores WHERE attempt_id=?').all(attemptId)) {
    scoresByAssignment.set(row.panel_assignment_id, row.score);
  }
  // Bounded to the attempt's CURRENT element_count: if the head judge shortened the routine after
  // some tricks beyond that were already judged, those leftover rows must be disregarded here too,
  // exactly like computeAttemptScore already does for the final score.
  const elementsByAssignment = new Map();
  for (const row of db.prepare('SELECT panel_assignment_id, element_number, value FROM element_scores WHERE attempt_id=? AND element_number<=? ORDER BY element_number').all(attemptId, elementCount)) {
    if (!elementsByAssignment.has(row.panel_assignment_id)) elementsByAssignment.set(row.panel_assignment_id, []);
    elementsByAssignment.get(row.panel_assignment_id).push({ number: row.element_number, value: row.value });
  }
  // 11th line: landing (is_deduction roles, full 10-skill routines, required) or bonus
  // (non-deduction roles, always optional) — see scoring.js. Outside the elementCount bound above.
  const extraByAssignment = new Map();
  for (const row of db.prepare('SELECT panel_assignment_id, value FROM element_scores WHERE attempt_id=? AND element_number=11').all(attemptId)) {
    extraByAssignment.set(row.panel_assignment_id, row.value);
  }

  const byRole = new Map();
  for (const a of assignments) {
    if (!byRole.has(a.role_key)) byRole.set(a.role_key, { name: a.role_name, granularity: a.granularity, judges: [] });
    const elements = elementsByAssignment.get(a.assignment_id) || [];
    const landingApplies = a.granularity === 'element' && a.isDeduction && elementCount === 10;
    const bonusApplies = a.granularity === 'element' && !a.isDeduction;
    const extraValue = (landingApplies || bonusApplies) ? extraByAssignment.get(a.assignment_id) : undefined;
    const score = scoresByAssignment.has(a.assignment_id) ? scoresByAssignment.get(a.assignment_id) : null;
    const submittedCount = a.granularity === 'element'
      ? elements.length + (extraValue !== undefined ? 1 : 0)
      : (score !== null ? 1 : 0);
    const requiredCount = a.granularity === 'element' ? elementCount + (landingApplies ? 1 : 0) : 1;
    const isDone = a.granularity === 'element' ? submittedCount >= requiredCount : submittedCount >= 1;
    let value = score;
    if (a.granularity === 'element' && elements.length > 0) {
      const sum = elements.reduce((acc, el) => acc + el.value, 0) + (extraValue !== undefined ? extraValue : 0);
      value = a.isDeduction ? elementCount - sum : sum;
    }
    byRole.get(a.role_key).judges.push({ name: a.judge_name, submittedCount, isDone, value });
  }
  return [...byRole.values()];
}

function findHeadJudgeAssignment(competitionId, userId) {
  return db.prepare(`
    SELECT pa.id AS assignment_id, jr.id AS judge_role_id, jr.score_min, jr.score_max
    FROM panel_assignments pa
    JOIN judge_roles jr ON jr.id = pa.judge_role_id
    WHERE pa.competition_id = ? AND pa.user_id = ? AND jr.key = 'head_judge'
  `).get(competitionId, userId);
}

// Round-robin order: every entry's attempt #1 (in start_order), then every entry's attempt #2,
// etc. — not each entry's attempts back-to-back.
function nextPendingAttemptId(roundId) {
  return db.prepare(`
    SELECT a.id FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.round_id = ? AND a.status = 'pending'
    ORDER BY a.attempt_number, e.start_order
    LIMIT 1
  `).get(roundId)?.id ?? null;
}

// Every attempt in the round, in the same round-robin order as nextPendingAttemptId, regardless
// of status — used by /back to step to whatever came before the current attempt so a head judge
// can correct an input mistake without touching any already-saved scores.
function orderedAttemptIds(roundId) {
  return db.prepare(`
    SELECT a.id FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.round_id = ?
    ORDER BY a.attempt_number, e.start_order
  `).all(roundId).map(r => r.id);
}

function loadRound(cid, gid, rid) {
  const competition = db.prepare('SELECT * FROM competitions WHERE id = ?').get(cid);
  if (!competition) return { error: res => res.status(404).send('Competition not found') };
  const group = db.prepare('SELECT id FROM groups WHERE id = ? AND competition_id = ?').get(gid, cid);
  if (!group) return { error: res => res.status(404).send('Group not found') };
  const round = db.prepare(`
    SELECT r.*, g.id AS group_id, g.name AS group_name,
           c.id AS competition_id, c.name AS competition_name, c.panel_template_id
    FROM rounds r
    JOIN groups g ON g.id = r.group_id
    JOIN competitions c ON c.id = g.competition_id
    WHERE r.id = ? AND r.group_id = ?
  `).get(rid, gid);
  if (!round) return { error: res => res.status(404).send('Round not found') };
  return { round };
}

router.get('/', (req, res) => {
  const user = req.session.user;
  const rounds = user.role === 'admin'
    ? db.prepare(`
        SELECT r.id, r.name, r.round_order, r.status,
               g.id AS group_id, g.name AS group_name,
               c.id AS competition_id, c.name AS competition_name, c.panel_template_id
        FROM rounds r
        JOIN groups g ON g.id = r.group_id
        JOIN competitions c ON c.id = g.competition_id
        WHERE c.status = 'active'
        ORDER BY c.name, g.name, r.round_order
      `).all()
    : db.prepare(`
        SELECT DISTINCT r.id, r.name, r.round_order, r.status,
               g.id AS group_id, g.name AS group_name,
               c.id AS competition_id, c.name AS competition_name, c.panel_template_id
        FROM rounds r
        JOIN groups g ON g.id = r.group_id
        JOIN competitions c ON c.id = g.competition_id
        JOIN panel_assignments pa ON pa.competition_id = c.id AND pa.user_id = ?
        JOIN judge_roles jr ON jr.id = pa.judge_role_id AND jr.key = 'head_judge'
        WHERE c.status = 'active'
        ORDER BY c.name, g.name, r.round_order
      `).all(user.id);

  rounds.forEach(r => {
    r.isReady = rosterReadiness(r.competition_id, r.panel_template_id).isReady;
  });

  res.render('head-judge/dashboard', { rounds });
});

router.get('/competitions/:cid/groups/:gid/rounds/:rid', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);

  const readiness = rosterReadiness(round.competition_id, round.panel_template_id);

  if (round.status !== 'in_progress') {
    return res.render('head-judge/round', { round, readiness, attempt: null, checklist: [] });
  }

  const attempt = db.prepare(`
    SELECT a.id AS attempt_id, a.attempt_number, a.element_count,
           e.start_order, sp.name AS sportsman_name, sp.club, sp.routine
    FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    WHERE a.id = ?
  `).get(round.current_attempt_id);

  const panelSlots = loadPanelSlots(round.panel_template_id);
  const { scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementScoresByAssignment } = loadAttemptScoreMaps(attempt.attempt_id);
  const { total, breakdown, isComplete } = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, attempt.element_count, elementScoresByAssignment);
  const hasAnyScore = scoresByJudgeRoleId.size > 0 || elementScoresByJudgeRoleId.size > 0;
  const judgeStatus = loadJudgeSubmissionStatus(round.panel_template_id, round.competition_id, attempt.attempt_id, attempt.element_count);

  // computeAttemptScore tracks element-granularity roles per-trick, not per-judge, so it has no
  // "count" field for execution/difficulty the way it does for attempt-granularity roles — fill
  // it in here from judgeStatus (how many assigned judges have submitted every trick).
  breakdown.forEach(item => {
    if (item.perTrick) {
      const roleStatus = judgeStatus.find(j => j.name === item.name);
      item.count = roleStatus ? roleStatus.judges.filter(j => j.isDone).length : 0;
    }
  });

  const headJudgeAssignment = findHeadJudgeAssignment(round.competition_id, req.session.user.id);
  let headJudgeScore = null;
  if (headJudgeAssignment) {
    const existing = db.prepare('SELECT score FROM scores WHERE attempt_id=? AND panel_assignment_id=?')
      .get(attempt.attempt_id, headJudgeAssignment.assignment_id);
    headJudgeScore = existing ? existing.score : null;
  }

  res.render('head-judge/round', {
    round, readiness, attempt, checklist: breakdown, judgeStatus,
    headJudgeAssignment, headJudgeScore, autoRefresh: true,
    attemptTotal: hasAnyScore ? total : null, attemptIsComplete: isComplete,
  });
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/start', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);
  const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

  if (round.status !== 'not_started') {
    req.session.flash = { error: 'This round has already been started.' };
    return res.redirect(backUrl);
  }
  if (!rosterReadiness(round.competition_id, round.panel_template_id).isReady) {
    req.session.flash = { error: 'The judge panel is not fully staffed yet. Assign all required judges first.' };
    return res.redirect(backUrl);
  }

  const firstAttemptId = nextPendingAttemptId(rid);
  if (!firstAttemptId) {
    req.session.flash = { error: 'This round has no attempts to score yet.' };
    return res.redirect(backUrl);
  }

  db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?").run(firstAttemptId, rid);
  req.session.flash = { success: 'Round started.' };
  res.redirect(backUrl);
});

// Steps back to whatever attempt preceded the current one (or, from a completed round, to the
// last attempt) so the head judge can correct an input mistake. Only moves the round's "current
// attempt" pointer — never touches any already-saved scores, so anything submitted for later
// attempts stays exactly as it was once the head judge moves forward again via Next.
router.post('/competitions/:cid/groups/:gid/rounds/:rid/back', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);
  const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

  if (round.status !== 'in_progress' && round.status !== 'completed') {
    req.session.flash = { error: 'This round has not been started yet.' };
    return res.redirect(backUrl);
  }

  const order = orderedAttemptIds(rid);
  const currentIndex = round.current_attempt_id ? order.indexOf(round.current_attempt_id) : order.length;
  const previousIndex = currentIndex - 1;
  if (previousIndex < 0) {
    req.session.flash = { error: 'Already at the first attempt — there is nothing before it.' };
    return res.redirect(backUrl);
  }

  db.prepare("UPDATE rounds SET status='in_progress', current_attempt_id=? WHERE id=?").run(order[previousIndex], rid);
  req.session.flash = { success: 'Moved back to the previous attempt.' };
  res.redirect(backUrl);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/next', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);
  const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

  if (round.status !== 'in_progress' || !round.current_attempt_id) {
    req.session.flash = { error: 'This round is not in progress.' };
    return res.redirect(backUrl);
  }

  const { isComplete } = recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);
  if (!isComplete) {
    req.session.flash = { error: 'Not every judge has submitted a score for the current attempt yet.' };
    return res.redirect(backUrl);
  }

  const nextId = nextPendingAttemptId(rid);
  if (nextId) {
    db.prepare('UPDATE rounds SET current_attempt_id=? WHERE id=?').run(nextId, rid);
    req.session.flash = { success: 'Advanced to the next attempt.' };
  } else {
    db.prepare("UPDATE rounds SET status='completed', current_attempt_id=NULL WHERE id=?").run(rid);
    req.session.flash = { success: 'Round completed — every attempt has been scored.' };
  }
  res.redirect(backUrl);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/skip', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);
  const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

  if (round.status !== 'in_progress' || !round.current_attempt_id) {
    req.session.flash = { error: 'This round is not in progress.' };
    return res.redirect(backUrl);
  }

  db.prepare("UPDATE attempts SET status='skipped' WHERE id=?").run(round.current_attempt_id);

  const nextId = nextPendingAttemptId(rid);
  if (nextId) {
    db.prepare('UPDATE rounds SET current_attempt_id=? WHERE id=?').run(nextId, rid);
    req.session.flash = { success: 'Attempt skipped — advanced to the next attempt.' };
  } else {
    db.prepare("UPDATE rounds SET status='completed', current_attempt_id=NULL WHERE id=?").run(rid);
    req.session.flash = { success: 'Attempt skipped — round completed, no attempts remain.' };
  }
  res.redirect(backUrl);
});

// Lets the head judge submit their own head_judge penalty mark straight from the control page,
// instead of switching to /referee — same validation/upsert as referee.js's POST /score, scoped
// to the head_judge role only and redirecting back here instead of to the referee round page.
router.post('/competitions/:cid/groups/:gid/rounds/:rid/score', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);
  const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

  if (round.status !== 'in_progress' || !round.current_attempt_id) {
    req.session.flash = { error: 'This round is not in progress.' };
    return res.redirect(backUrl);
  }
  if (String(round.current_attempt_id) !== String(req.body.attemptId)) {
    req.session.flash = { error: 'That attempt is not the round\'s current attempt.' };
    return res.redirect(backUrl);
  }

  const assignment = findHeadJudgeAssignment(round.competition_id, req.session.user.id);
  if (!assignment) {
    req.session.flash = { error: 'You do not hold the head judge scoring role for this competition.' };
    return res.redirect(backUrl);
  }

  const parsed = parseFloat(req.body.score);
  const inRange = !isNaN(parsed) && parsed >= assignment.score_min && (assignment.score_max === null || parsed <= assignment.score_max);
  if (!inRange) {
    req.session.flash = {
      error: assignment.score_max !== null
        ? `Score must be between ${assignment.score_min} and ${assignment.score_max}.`
        : `Score must be at least ${assignment.score_min}.`,
    };
    return res.redirect(backUrl);
  }

  db.prepare('INSERT OR REPLACE INTO scores (attempt_id, panel_assignment_id, judge_role_id, score) VALUES (?,?,?,?)')
    .run(round.current_attempt_id, assignment.assignment_id, assignment.judge_role_id, parsed);

  recomputeAttemptCompletion(round.current_attempt_id, round.panel_template_id);

  req.session.flash = { success: `Head judge penalty ${parsed.toFixed(1)} saved.` };
  res.redirect(backUrl);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/complete', (req, res) => {
  const { cid, gid, rid } = req.params;
  const { error } = loadRound(cid, gid, rid);
  if (error) return error(res);

  db.prepare("UPDATE rounds SET status='completed', current_attempt_id=NULL WHERE id=?").run(rid);
  req.session.flash = { success: 'Round marked as completed.' };
  res.redirect(`/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/attempts/:aid/element-count', (req, res) => {
  const { cid, gid, rid, aid } = req.params;
  const { round, error } = loadRound(cid, gid, rid);
  if (error) return error(res);
  const backUrl = `/head-judge/competitions/${cid}/groups/${gid}/rounds/${rid}`;

  if (String(round.current_attempt_id) !== String(aid)) {
    req.session.flash = { error: 'That attempt is not the round\'s current attempt.' };
    return res.redirect(backUrl);
  }

  const elementCount = parseInt(req.body.element_count, 10);
  if (isNaN(elementCount) || elementCount < 0 || elementCount > 10) {
    req.session.flash = { error: 'Trick count must be between 0 and 10.' };
    return res.redirect(backUrl);
  }

  db.prepare('UPDATE attempts SET element_count=? WHERE id=?').run(elementCount, aid);
  req.session.flash = { success: `Trick count set to ${elementCount}.` };
  res.redirect(backUrl);
});

module.exports = router;
