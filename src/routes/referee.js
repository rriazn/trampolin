const router = require('express').Router();
const { requireReferee } = require('../middleware/auth');
const db = require('../db/database');

router.use(requireReferee);

router.get('/', (req, res) => {
  const rounds = db.prepare(`
    SELECT r.id, r.name, r.round_order, c.name AS competition_name, c.id AS competition_id
    FROM rounds r
    JOIN competitions c ON c.id = r.competition_id
    WHERE c.status = 'active'
    ORDER BY c.date DESC, r.round_order
  `).all();
  res.render('referee/dashboard', { rounds });
});

router.get('/round/:roundId', (req, res) => {
  const { roundId } = req.params;
  const refereeId = req.session.user.id;

  const round = db.prepare(`
    SELECT r.*, c.name AS competition_name
    FROM rounds r JOIN competitions c ON c.id=r.competition_id
    WHERE r.id=?`).get(roundId);
  if (!round) return res.status(404).send('Round not found');

  const attempts = db.prepare(`
    SELECT a.id AS attempt_id, a.attempt_number, a.status,
           e.start_order, sp.name AS sportsman_name, sp.club, sp.category,
           s.score AS my_score
    FROM entries e
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    JOIN attempts a ON a.entry_id = e.id
    LEFT JOIN scores s ON s.attempt_id = a.id AND s.referee_id = ?
    WHERE e.round_id = ?
    ORDER BY e.start_order, a.attempt_number
  `).all(refereeId, roundId);

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

  const entry = db.prepare(
    'SELECT e.round_id FROM attempts a JOIN entries e ON e.id=a.entry_id WHERE a.id=?'
  ).get(attemptId);

  req.session.flash = { success: `Score ${parsed.toFixed(1)} saved.` };
  res.redirect(`/referee/round/${entry.round_id}`);
});

module.exports = router;
