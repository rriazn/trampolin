const router = require('express').Router();
const db = require('../db/database');

function trimmedMean(scores) {
  if (scores.length === 0) return null;
  if (scores.length < 3) return scores.reduce((a, b) => a + b, 0) / scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}

router.get('/competitions/:cid/groups/:gid/rounds/:rid', (req, res) => {
  const { cid, gid, rid } = req.params;

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

  const rows = db.prepare(`
    SELECT
      sp.id AS sportsman_id, sp.name AS sportsman_name, sp.club,
      g.name AS group_name,
      e.start_order,
      a.id AS attempt_id, a.attempt_number,
      s.score
    FROM entries e
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    LEFT JOIN groups g ON g.id = sp.group_id
    JOIN attempts a ON a.entry_id = e.id
    LEFT JOIN scores s ON s.attempt_id = a.id
    WHERE e.round_id = ?
    ORDER BY sp.id, a.attempt_number
  `).all(rid);

  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.sportsman_id)) {
      map.set(row.sportsman_id, {
        name: row.sportsman_name,
        club: row.club,
        group: row.group_name,
        startOrder: row.start_order,
        attempts: new Map()
      });
    }
    const sp = map.get(row.sportsman_id);
    if (!sp.attempts.has(row.attempt_id)) {
      sp.attempts.set(row.attempt_id, { number: row.attempt_number, scores: [] });
    }
    if (row.score !== null) {
      sp.attempts.get(row.attempt_id).scores.push(row.score);
    }
  }

  const leaderboard = [];
  for (const [id, sp] of map) {
    const attemptScores = [...sp.attempts.values()].map(a => ({
      number: a.number,
      finalScore: trimmedMean(a.scores),
      scoreCount: a.scores.length
    })).sort((a, b) => a.number - b.number);

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

  res.render('leaderboard', { round, leaderboard, maxAttempts, autoRefresh: true });
});

module.exports = router;
module.exports.trimmedMean = trimmedMean;
