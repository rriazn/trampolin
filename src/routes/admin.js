'use strict';
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
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');
  const sportsmen = db.prepare(`
    SELECT s.*, g.name AS group_name
    FROM sportsmen s
    LEFT JOIN groups g ON g.id = s.group_id
    WHERE s.competition_id = ?
    ORDER BY s.name
  `).all(req.params.id);
  res.render('admin/sportsmen', { competition, sportsmen });
});

router.get('/competitions/:id/sportsmen/export', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id = ?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');
  const clean_comp_name = competition.name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // eslint-disable-line no-control-regex
    .replace(/\s+/g, '-')
    .replace(/\.+$/, '')
    .trim();

  const sportsmen = db.prepare(`
    SELECT s.name, s.club, s.gender, s.birth_year, s.routine, g.name AS group_name
    FROM sportsmen s
    LEFT JOIN groups g ON g.id = s.group_id
    WHERE s.competition_id = ?
    ORDER BY s.name
  `).all(req.params.id);
  const ws = XLSX.utils.json_to_sheet(sportsmen.map(s => ({
    Name: s.name,
    Club: s.club || '',
    Gender: s.gender || '',
    Birthyear: s.birth_year || '',
    Routine: s.routine || '',
    Group: s.group_name || '',
  })));
  ws['!cols'] = [{ wch: 28 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 20 }, { wch: 20 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sportsmen');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="sportsmen-${clean_comp_name}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.send(buf);
});

router.get('/competitions/:id/sportsmen/new', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');
  const groups = db.prepare('SELECT * FROM groups WHERE competition_id=? ORDER BY name').all(req.params.id);
  res.render('admin/sportsman-form', {
    sportsman: null,
    competition,
    groups,
    action: `/admin/competitions/${req.params.id}/sportsmen`,
  });
});

router.post('/competitions/:id/sportsmen', (req, res) => {
  const { name, club, gender, birth_year, routine, group_id } = req.body;
  if (!name || !name.trim()) {
    const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
    const groups = db.prepare('SELECT * FROM groups WHERE competition_id=? ORDER BY name').all(req.params.id);
    return res.status(400).render('admin/sportsman-form', {
      sportsman: null, competition, groups,
      action: `/admin/competitions/${req.params.id}/sportsmen`,
      error: 'Name is required.',
    });
  }
  db.prepare('INSERT INTO sportsmen (name,club,gender,birth_year,routine,competition_id,group_id) VALUES (?,?,?,?,?,?,?)')
    .run(name.trim(), club || null, gender || null, birth_year ? parseInt(birth_year) : null, routine || null, req.params.id, group_id || null);
  req.session.flash = { success: `Athlete "${name}" added.` };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

router.get('/competitions/:id/sportsmen/:sid/edit', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');
  const sportsman = db.prepare('SELECT * FROM sportsmen WHERE id=?').get(req.params.sid);
  if (!sportsman) return res.status(404).send('Sportsman not found');
  const groups = db.prepare('SELECT * FROM groups WHERE competition_id=? ORDER BY name').all(req.params.id);
  res.render('admin/sportsman-form', {
    sportsman,
    competition,
    groups,
    action: `/admin/competitions/${req.params.id}/sportsmen/${sportsman.id}`,
  });
});

router.post('/competitions/:id/sportsmen/:sid/delete', (req, res) => {
  db.prepare('DELETE FROM sportsmen WHERE id=?').run(req.params.sid);
  req.session.flash = { success: 'Athlete deleted.' };
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
  const insert = db.prepare('INSERT INTO sportsmen (name,club,gender,birth_year,routine,competition_id) VALUES (?,?,?,?,?,?)');
  const insertAll = db.transaction(() => {
    let created = 0, skipped = 0;
    for (const row of rows) {
      const name = String(row['Name'] || row['name'] || '').trim();
      if (!name) { skipped++; continue; }
      const club = String(row['Club'] || row['club'] || '').trim() || null;
      const gender = String(row['Gender'] || row['gender'] || '').trim() || null;
      const birth_year_raw = String(row['Birthyear'] || row['Birth Year'] || row['birth_year'] || '').trim();
      const birth_year = birth_year_raw ? parseInt(birth_year_raw) : null;
      const routine = String(row['Routine'] || row['routine'] || '').trim() || null;
      insert.run(name, club, gender, birth_year, routine, req.params.id);
      created++;
    }
    return { created, skipped };
  });
  const { created, skipped } = insertAll();
  req.session.flash = { success: `Import complete: ${created} added, ${skipped} skipped (missing name).` };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

router.post('/competitions/:id/sportsmen/:sid', (req, res) => {
  const { name, club, gender, birth_year, routine, group_id } = req.body;
  if (!name || !name.trim()) {
    const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
    const groups = db.prepare('SELECT * FROM groups WHERE competition_id=? ORDER BY name').all(req.params.id);
    const sportsman = db.prepare('SELECT * FROM sportsmen WHERE id=?').get(req.params.sid);
    return res.status(400).render('admin/sportsman-form', {
      sportsman, competition, groups,
      action: `/admin/competitions/${req.params.id}/sportsmen/${req.params.sid}`,
      error: 'Name is required.',
    });
  }
  db.prepare('UPDATE sportsmen SET name=?,club=?,gender=?,birth_year=?,routine=?,group_id=? WHERE id=?')
    .run(name.trim(), club || null, gender || null, birth_year ? parseInt(birth_year) : null, routine || null, group_id || null, req.params.sid);
  req.session.flash = { success: 'Athlete updated.' };
  res.redirect(`/admin/competitions/${req.params.id}/sportsmen`);
});

// ── Groups ───────────────────────────────────────────────────────────────────

router.get('/competitions/:id/groups', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');
  const groups = db.prepare(`
    SELECT g.*, COUNT(r.id) AS round_count
    FROM groups g
    LEFT JOIN rounds r ON r.group_id = g.id
    WHERE g.competition_id = ?
    GROUP BY g.id
    ORDER BY g.name
  `).all(req.params.id);
  res.render('admin/groups', { competition, groups });
});

router.post('/competitions/:id/groups', (req, res) => {
  const { name } = req.body;
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');
  if (!name || !name.trim()) {
    const groups = db.prepare(`
      SELECT g.*, COUNT(r.id) AS round_count
      FROM groups g LEFT JOIN rounds r ON r.group_id = g.id
      WHERE g.competition_id = ? GROUP BY g.id ORDER BY g.name
    `).all(req.params.id);
    return res.status(400).render('admin/groups', { competition, groups, error: 'Group name is required.' });
  }
  db.prepare('INSERT INTO groups (name, competition_id) VALUES (?, ?)').run(name.trim(), req.params.id);
  req.session.flash = { success: `Group "${name}" created.` };
  res.redirect(`/admin/competitions/${req.params.id}/groups`);
});

router.post('/competitions/:id/groups/:gid/delete', (req, res) => {
  db.prepare('DELETE FROM groups WHERE id=? AND competition_id=?').run(req.params.gid, req.params.id);
  req.session.flash = { success: 'Group deleted.' };
  res.redirect(`/admin/competitions/${req.params.id}/groups`);
});

// ── Rounds ───────────────────────────────────────────────────────────────────

router.get('/competitions/:cid/groups/:gid/rounds', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.cid);
  if (!competition) return res.status(404).send('Competition not found');
  const group = db.prepare('SELECT * FROM groups WHERE id=? AND competition_id=?').get(req.params.gid, req.params.cid);
  if (!group) return res.status(404).send('Group not found');
  const rounds = db.prepare('SELECT * FROM rounds WHERE group_id=? ORDER BY round_order').all(req.params.gid);
  res.render('admin/rounds', { competition, group, rounds });
});

router.post('/competitions/:cid/groups/:gid/rounds', (req, res) => {
  const { name, round_order } = req.body;
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.cid);
  if (!competition) return res.status(404).send('Not found');
  const group = db.prepare('SELECT * FROM groups WHERE id=? AND competition_id=?').get(req.params.gid, req.params.cid);
  if (!group) return res.status(404).send('Not found');

  const renderWithError = (error) => {
    const rounds = db.prepare('SELECT * FROM rounds WHERE group_id=? ORDER BY round_order').all(req.params.gid);
    return res.status(400).render('admin/rounds', { competition, group, rounds, error });
  };

  if (!name || !name.trim()) return renderWithError('Round name is required.');
  if (round_order !== undefined && round_order !== '' && (isNaN(round_order) || Number(round_order) < 0))
    return renderWithError('Round order must be a non-negative number.');

  db.prepare('INSERT INTO rounds (group_id,name,round_order) VALUES (?,?,?)')
    .run(req.params.gid, name.trim(), parseInt(round_order) || 0);
  req.session.flash = { success: `Round "${name}" added.` };
  res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds`);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/delete', (req, res) => {
  db.prepare('DELETE FROM rounds WHERE id=? AND group_id=?').run(req.params.rid, req.params.gid);
  req.session.flash = { success: 'Round deleted.' };
  res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds`);
});

// ── Entries ──────────────────────────────────────────────────────────────────

router.get('/competitions/:cid/groups/:gid/rounds/:rid/entries', (req, res) => {
  const { cid, gid, rid } = req.params;

  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(cid);
  if (!competition) return res.status(404).send('Competition not found');
  const group = db.prepare('SELECT * FROM groups WHERE id=? AND competition_id=?').get(gid, cid);
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

  const entries = db.prepare(`
    SELECT e.*, sp.name AS sportsman_name, sp.club, sp.routine,
           (SELECT COUNT(*) FROM attempts a WHERE a.entry_id=e.id) AS attempt_count
    FROM entries e
    JOIN sportsmen sp ON sp.id = e.sportsman_id
    LEFT JOIN groups g ON g.id = sp.group_id
    WHERE e.round_id = ?
    ORDER BY e.start_order
  `).all(rid);

  const available = db.prepare(`
    SELECT s.*, g.name AS group_name
    FROM sportsmen s
    LEFT JOIN groups g ON g.id = s.group_id
    WHERE s.competition_id = ?
      AND s.id NOT IN (SELECT sportsman_id FROM entries WHERE round_id = ?)
    ORDER BY s.name
  `).all(round.competition_id, rid);

  res.render('admin/entries', { round, entries, available });
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries', (req, res) => {
  const { sportsman_id, start_order } = req.body;
  try {
    db.prepare('INSERT INTO entries (round_id,sportsman_id,start_order) VALUES (?,?,?)')
      .run(req.params.rid, sportsman_id, parseInt(start_order) || 0);
    req.session.flash = { success: 'Athlete added to round.' };
  } catch {
    req.session.flash = { error: 'Athlete already in this round.' };
  }
  res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries/:eid/delete', (req, res) => {
  db.prepare('DELETE FROM entries WHERE id=? AND round_id=?').run(req.params.eid, req.params.rid);
  req.session.flash = { success: 'Entry removed.' };
  res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/attempts/bulk', (req, res) => {
  const count = Math.min(Math.max(parseInt(req.body.attempt_count) || 2, 1), 20);
  const entries = db.prepare('SELECT id FROM entries WHERE round_id=?').all(req.params.rid);
  const insertAttempt = db.prepare('INSERT OR IGNORE INTO attempts (entry_id,attempt_number) VALUES (?,?)');
  db.transaction(() => {
    for (const e of entries) {
      for (let n = 1; n <= count; n++) {
        insertAttempt.run(e.id, n);
      }
    }
  })();
  req.session.flash = { success: `${count} attempt(s) created for all entries.` };
  res.redirect(`/admin/competitions/${req.params.cid}/groups/${req.params.gid}/rounds/${req.params.rid}/entries`);
});

module.exports = router;
