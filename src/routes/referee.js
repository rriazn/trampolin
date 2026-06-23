const router = require('express').Router();
const { requireReferee } = require('../middleware/auth');
const db = require('../db/database');

router.use(requireReferee);

router.get('/', (req, res) => {
  const rounds = db.prepare(`
    SELECT r.id, r.name, r.round_order,
           g.id AS group_id, g.name AS group_name,
           c.id AS competition_id, c.name AS competition_name
    FROM rounds r
    JOIN groups g ON g.id = r.group_id
    JOIN competitions c ON c.id = g.competition_id
    WHERE c.status = 'active'
    ORDER BY c.date DESC, r.round_order
  `).all();
  res.render('referee/dashboard', { rounds });
});

router.get('/competitions/:cid/groups/:gid/rounds/:rid', (req, res) => {
  const refereeId = req.session.user.id;

  const round = db.prepare(`
    SELECT r.*, g.id AS group_id, g.name AS group_name,
           c.id AS competition_id, c.name AS competition_name
    FROM rounds r
    JOIN groups g ON g.id = r.group_id
    JOIN competitions c ON c.id = g.competition_id
    WHERE r.id = ? AND g.id = ? AND c.id = ?
  `).get(req.params.rid, req.params.gid, req.params.cid);
  if (!round) return res.status(404).send('Round not found');

  const attempts = db.prepare(`
    SELECT a.id AS attempt_id, a.attempt_number, a.status,
           e.start_order, sp.name AS sportsman_name, sp.club,
           s.score AS my_score
    FROM entries e
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    JOIN attempts a ON a.entry_id = e.id
    LEFT JOIN scores s ON s.attempt_id = a.id AND s.referee_id = ?
    WHERE e.round_id = ?
    ORDER BY e.start_order, a.attempt_number
  `).all(refereeId, req.params.rid);

  res.render('referee/round', { round, attempts });
});

router.post('/score', (req, res) => {
  const { attemptId, score } = req.body;
  const refereeId = req.session.user.id;
  const parsed = parseFloat(score);
  if (isNaN(parsed) || parsed < 0 || parsed > 10) {
    return res.status(400).send('Score must be between 0 and 10');
  }

  db.prepare('INSERT OR REPLACE INTO scores (attempt_id, referee_id, score) VALUES (?, ?, ?)')
    .run(attemptId, refereeId, parsed);

  db.prepare("UPDATE attempts SET status='scored' WHERE id=?").run(attemptId);

  const ctx = db.prepare(`
    SELECT e.round_id, r.group_id, g.competition_id
    FROM attempts a
    JOIN entries e ON e.id = a.entry_id
    JOIN rounds r ON r.id = e.round_id
    JOIN groups g ON g.id = r.group_id
    WHERE a.id = ?
  `).get(attemptId);

  req.session.flash = { success: `Score ${parsed.toFixed(1)} saved.` };
  res.redirect(`/referee/competitions/${ctx.competition_id}/groups/${ctx.group_id}/rounds/${ctx.round_id}`);
});

module.exports = router;
