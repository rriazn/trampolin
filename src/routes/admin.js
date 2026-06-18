const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAdmin } = require('../middleware/auth');
const db = require('../db/database');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAdmin);

// Dashboard
router.get('/', (req, res) => {
  const stats = {
    users: db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='referee'").get().n,
    sportsmen: db.prepare('SELECT COUNT(*) AS n FROM sportsmen').get().n,
    competitions: db.prepare('SELECT COUNT(*) AS n FROM competitions').get().n,
  };
  const competitions = db.prepare(
    "SELECT * FROM competitions ORDER BY created_at DESC LIMIT 5"
  ).all();
  res.render('admin/dashboard', { stats, competitions });
});

// ── Users ────────────────────────────────────────────────────────────────────

router.get('/users', (req, res) => {
  const users = db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY name").all();
  res.render('admin/users', { users });
});

router.get('/users/export', (req, res) => {
  const users = db.prepare("SELECT name, email, role, created_at FROM users WHERE role='referee' ORDER BY name").all();
  const ws = XLSX.utils.json_to_sheet(users.map(u => ({
    Name: u.name,
    Email: u.email,
    Role: u.role,
    'Created At': u.created_at.substring(0, 10),
  })));
  ws['!cols'] = [{ wch: 28 }, { wch: 36 }, { wch: 10 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Referees');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', 'attachment; filename="referees.xlsx"');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/users/new', (req, res) => {
  res.render('admin/user-form', { user: null, action: '/admin/users' });
});

router.post('/users', async (req, res) => {
  const { name, email, password, role } = req.body;
  if (!name || !email || !password) {
    return res.status(400).render('admin/user-form', {
      user: null, action: '/admin/users',
      error: 'Name, email and password are required.',
    });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
      .run(name, email, hash, role === 'admin' ? 'admin' : 'referee');
  } catch {
    return res.status(422).render('admin/user-form', {
      user: null, action: '/admin/users',
      error: 'Email already in use.',
    });
  }
  req.session.flash = { success: `User "${name}" created.` };
  res.redirect('/admin/users');
});

router.get('/users/:id/edit', (req, res) => {
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).send('Not found');
  res.render('admin/user-form', { user, action: `/admin/users/${user.id}` });
});

router.post('/users/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    req.session.flash = { error: 'No file uploaded.' };
    return res.redirect('/admin/users');
  }
  const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const defaultHash = await bcrypt.hash('referee123', 10);
  const insert = db.prepare('INSERT OR IGNORE INTO users (name,email,password_hash,role) VALUES (?,?,?,?)');
  let created = 0, skipped = 0;
  for (const row of rows) {
    const name = String(row['Name'] || row['name'] || '').trim();
    const email = String(row['Email'] || row['email'] || '').trim().toLowerCase();
    if (!name || !email) { skipped++; continue; }
    const hash = row['Password'] || row['password']
      ? await bcrypt.hash(String(row['Password'] || row['password']), 10)
      : defaultHash;
    const role = String(row['Role'] || row['role'] || 'referee').trim().toLowerCase();
    const info = insert.run(name, email, hash, role === 'admin' ? 'admin' : 'referee');
    info.changes ? created++ : skipped++;
  }
  req.session.flash = { success: `Import complete: ${created} added, ${skipped} skipped (duplicate/invalid).` };
  res.redirect('/admin/users');
});

router.post('/users/:id/delete', (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  req.session.flash = { success: 'User deleted.' };
  res.redirect('/admin/users');
});

router.post('/users/:id', async (req, res) => {
  const { name, email, password, role } = req.body;
  const action = `/admin/users/${req.params.id}`;
  const user = db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(req.params.id);
  if (!user) return res.status(404).send('Not found');
  if (!name || !email) {
    return res.status(400).render('admin/user-form', {
      user, action, error: 'Name and email are required.',
    });
  }
  try {
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      db.prepare('UPDATE users SET name=?,email=?,password_hash=?,role=? WHERE id=?')
        .run(name, email, hash, role === 'admin' ? 'admin' : 'referee', req.params.id);
    } else {
      db.prepare('UPDATE users SET name=?,email=?,role=? WHERE id=?')
        .run(name, email, role === 'admin' ? 'admin' : 'referee', req.params.id);
    }
  } catch {
    return res.status(422).render('admin/user-form', {
      user, action, error: 'Email already in use.',
    });
  }
  req.session.flash = { success: 'User updated.' };
  res.redirect('/admin/users');
});


// ── Competitions ─────────────────────────────────────────────────────────────

router.get('/competitions', (req, res) => {
  const competitions = db.prepare('SELECT * FROM competitions ORDER BY date DESC, created_at DESC').all();
  res.render('admin/competitions', { competitions });
});

router.get('/competitions/new', (req, res) => {
  res.render('admin/competition-form', { competition: null, action: '/admin/competitions' });
});

router.post('/competitions', (req, res) => {
  const { name, date } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).render('admin/competition-form', {
      competition: null, action: '/admin/competitions',
      error: 'Competition name is required.',
    });
  }
  db.prepare('INSERT INTO competitions (name,date) VALUES (?,?)').run(name.trim(), date || null);
  req.session.flash = { success: `Competition "${name}" created.` };
  res.redirect('/admin/competitions');
});

router.get('/competitions/:id/edit', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Not found');
  res.render('admin/competition-form', { competition, action: `/admin/competitions/${competition.id}` });
});

router.post('/competitions/:id', (req, res) => {
  const { name, date } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).render('admin/competition-form', {
      competition: null, action: '/admin/competitions',
      error: 'Competition name is required.',
    });
  }
  db.prepare('UPDATE competitions SET name=?,date=? WHERE id=?').run(name, date || null, req.params.id);
  req.session.flash = { success: 'Competition updated.' };
  res.redirect('/admin/competitions');
});

router.post('/competitions/:id/status', (req, res) => {
  const { status } = req.body;
  if (!['planned', 'active', 'closed'].includes(status)) return res.status(400).send('Bad status');
  db.prepare('UPDATE competitions SET status=? WHERE id=?').run(status, req.params.id);
  req.session.flash = { success: `Status set to "${status}".` };
  res.redirect('/admin/competitions');
});

router.post('/competitions/:id/delete', (req, res) => {
  db.prepare('DELETE FROM competitions WHERE id=?').run(req.params.id);
  req.session.flash = { success: 'Competition and all associated data deleted.' };
  res.redirect('/admin/competitions');
});


// ── Sportsmen ────────────────────────────────────────────────────────────────

router.get('/competitions/:id/sportsmen', (req, res) => {
  const sportsmen = db.prepare('SELECT * FROM sportsmen WHERE competition_id = ? ORDER BY name').get(req.params.id);
  res.render('admin/sportsmen', { sportsmen });
});

router.get('/competitions/:id/sportsmen/export', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id = ?').get(req.params.id);
  const clean_comp_name = competition.name
                          .toLowerCase()
                          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                          .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
                          .replace(/\s+/g, '-')
                          .replace(/\.+$/, '')
                          .trim();
  const sportsmen = db.prepare('SELECT name, club, category, created_at FROM sportsmen ORDER BY name').get(req.params.id);
  const ws = XLSX.utils.json_to_sheet(sportsmen.map(s => ({
    Name: s.name,
    Club: s.club || '',
    Gender: s.gender || '',
    Birthyear: s.birth_year || '',
    Routine: s.routine || '',
  })));
  ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sportsmen');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="sportsmen-${clean_comp_name}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/competitions/:id/sportsmen/new', (req, res) => {
  res.render('admin/sportsman-form', { sportsman: null, action: '/admin/sportsmen' });
});

router.post('/competitions/:id/sportsmen', (req, res) => {
  const { name, club, gender, birth_year, routine } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).render('admin/sportsman-form', {
      sportsman: null, action: '/admin/sportsmen',
      error: 'Name is required.',
    });
  }
  db.prepare('INSERT INTO sportsmen (name,club,gender, birth_year, routine) VALUES (?,?,?,?,?)').run(name.trim(), club || null, gender || 'f', birth_year || 2000, routine || '');
  req.session.flash = { success: `Sportsman "${name}" added.` };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

router.get('/competitions/:id/sportsmen/:sid/edit', (req, res) => {
  const sportsman = db.prepare('SELECT * FROM sportsmen WHERE id=?').get(req.params.sid);
  if (!sportsman) return res.status(404).send('Not found');
  res.render('admin/sportsman-form', { sportsman, action: `/admin/competitions/${req.params.id}/sportsmen/${sportsman.id}` });
});

router.post('/competitions/:id/sportsmen/:sid/delete', (req, res) => {
  db.transaction(() => {
    db.prepare('DELETE FROM entries WHERE sportsman_id=?').run(req.params.sid);
    db.prepare('DELETE FROM sportsmen WHERE id=?').run(req.params.sid);
  })();
  req.session.flash = { success: 'Sportsman deleted.' };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

router.post('/competitions/:id/sportsmen/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    req.session.flash = { error: 'No file uploaded.' };
    return res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
  }
  let rows = [];
  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  } catch {
    // unparseable file — rows stays empty, all will be counted as skipped
  }
  const insert = db.prepare('INSERT INTO sportsmen (name,club,gender, birth_year, routine) VALUES (?,?,?,?,?)');
  const insertAll = db.transaction(() => {
    let created = 0, skipped = 0;
    for (const row of rows) {
      const name = String(row['Name'] || row['name'] || '').trim();
      if (!name) { skipped++; continue; }
      const club = String(row['Club'] || row['club'] || '').trim() || null;
      const gender = String(row['Gender'] || row['gender'] || '').trim() || 'f';
      const birth_year = String(row['Birth year'] || row['birth year'] || row['Birth Year'] || '').trim() || 2000;
      const routine = String(row['Routine'] || row['routine'] || '').trim() || null;
      insert.run(name, club, gender, birth_year, routine);
      created++;
    }
    return { created, skipped };
  });
  const { created, skipped } = insertAll();
  req.session.flash = { success: `Import complete: ${created} added, ${skipped} skipped (missing name).` };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

router.post('/competitions/:id/sportsmen/:sid', (req, res) => {
  const { name, club, gender, birth_year, routine } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).render('admin/sportsman-form', {
      sportsman: null, action: `/admin/competitions/${req.params.id}/sportsmen`,
      error: 'Name is required.',
    });
  }
  db.prepare('UPDATE sportsmen SET name=?,club=?,gender=?,birth_year=?,routine=? WHERE sid=?')
    .run(name, club || null, gender || 'f', birth_year || 2000, routine || null, req.params.id);
  req.session.flash = { success: 'Sportsman updated.' };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

// ── Rounds ───────────────────────────────────────────────────────────────────

router.get('/competitions/:id/rounds', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Not found');
  const rounds = db.prepare('SELECT * FROM rounds WHERE competition_id=? ORDER BY round_order').all(req.params.id);
  res.render('admin/rounds', { competition, rounds });
});

router.post('/competitions/:id/rounds', (req, res) => {
  const { name, round_order } = req.body;
  const renderWithError = (error) => {
    const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
    if (!competition) return res.status(404).send('Not found');
    const rounds = db.prepare('SELECT * FROM rounds WHERE competition_id=? ORDER BY round_order').all(req.params.id);
    return res.status(400).render('admin/rounds', { competition, rounds, error });
  };
  if (!name || !name.trim()) return renderWithError('Round name is required.');
  if (round_order !== undefined && round_order !== '' && (isNaN(round_order) || Number(round_order) < 0))
    return renderWithError('Round order must be a non-negative number.');
  db.prepare('INSERT INTO rounds (competition_id,name,round_order) VALUES (?,?,?)').run(req.params.id, name.trim(), parseInt(round_order) || 0);
  req.session.flash = { success: `Round "${name}" added.` };
  res.redirect(`/admin/competitions/${req.params.id}/rounds`);
});

router.post('/rounds/:id/delete', (req, res) => {
  const round = db.prepare('SELECT competition_id FROM rounds WHERE id=?').get(req.params.id);
  if (!round) return res.status(404).send('Not found');
  db.prepare('DELETE FROM rounds WHERE id=?').run(req.params.id);
  req.session.flash = { success: 'Round deleted.' };
  res.redirect(`/admin/competitions/${round.competition_id}/rounds`);
});

// ── Entries ──────────────────────────────────────────────────────────────────

router.get('/rounds/:id/entries', (req, res) => {
  const round = db.prepare(`
    SELECT r.*, c.name AS competition_name, c.id AS competition_id
    FROM rounds r JOIN competitions c ON c.id=r.competition_id
    WHERE r.id=?`).get(req.params.id);
  if (!round) return res.status(404).send('Not found');

  const entries = db.prepare(`
    SELECT e.*, sp.name AS sportsman_name, sp.club,
           (SELECT COUNT(*) FROM attempts a WHERE a.entry_id=e.id) AS attempt_count
    FROM entries e JOIN sportsmen sp ON sp.id=e.sportsman_id
    WHERE e.round_id=? ORDER BY e.start_order`).all(req.params.id);

  const allSportsmen = db.prepare('SELECT * FROM sportsmen ORDER BY name').all();
  const enteredIds = new Set(entries.map(e => e.sportsman_id));
  const available = allSportsmen.filter(s => !enteredIds.has(s.id));

  res.render('admin/entries', { round, entries, available });
});

router.post('/rounds/:id/entries', (req, res) => {
  const { sportsman_id, start_order } = req.body;
  try {
    db.prepare('INSERT INTO entries (round_id,sportsman_id,start_order) VALUES (?,?,?)')
      .run(req.params.id, sportsman_id, parseInt(start_order) || 0);
    req.session.flash = { success: 'Sportsman added to round.' };
  } catch {
    req.session.flash = { error: 'Sportsman already in this round.' };
  }
  res.redirect(`/admin/rounds/${req.params.id}/entries`);
});

router.post('/entries/:id/delete', (req, res) => {
  const entry = db.prepare('SELECT round_id FROM entries WHERE id=?').get(req.params.id);
  if (!entry) return res.status(404).send('Not found');
  db.prepare('DELETE FROM entries WHERE id=?').run(req.params.id);
  req.session.flash = { success: 'Entry removed.' };
  res.redirect(`/admin/rounds/${entry.round_id}/entries`);
});

// Bulk-create attempts 1 and 2 for all entries in a round
router.post('/rounds/:id/attempts/bulk', (req, res) => {
  const entries = db.prepare('SELECT id FROM entries WHERE round_id=?').all(req.params.id);
  const insertAttempt = db.prepare('INSERT OR IGNORE INTO attempts (entry_id,attempt_number) VALUES (?,?)');
  const insertAll = db.transaction(() => {
    for (const e of entries) {
      insertAttempt.run(e.id, 1);
      insertAttempt.run(e.id, 2);
    }
  });
  insertAll();
  req.session.flash = { success: 'Attempts created for all entries.' };
  res.redirect(`/admin/rounds/${req.params.id}/entries`);
});

module.exports = router;
