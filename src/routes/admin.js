'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
const { requireAdmin } = require('../middleware/auth');
const db = require('../db/database');
const { computeAttemptScore } = require('../utils/scoring');

function loadPanelSlots(panelTemplateId) {
  if (!panelTemplateId) return [];
  return db.prepare(`
    SELECT s.judge_role_id AS judgeRoleId, s.judge_count AS judgeCount, s.drop_high AS dropHigh,
           s.drop_low AS dropLow, s.combine, s.multiplier,
           jr.key AS judgeRoleKey, jr.name AS judgeRoleName, jr.granularity,
           jr.is_deduction AS isDeduction, jr.max_value AS maxValue
    FROM panel_template_slots s
    JOIN judge_roles jr ON jr.id = s.judge_role_id
    WHERE s.panel_template_id = ?
    ORDER BY s.sort_order
  `).all(panelTemplateId);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const normalizeRole = (role) => ['admin', 'head_judge'].includes(role) ? role : 'referee';

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
      .run(name, email, hash, normalizeRole(role));
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
    const info = insert.run(name, email, hash, normalizeRole(role));
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
        .run(name, email, hash, normalizeRole(role), req.params.id);
    } else {
      db.prepare('UPDATE users SET name=?,email=?,role=? WHERE id=?')
        .run(name, email, normalizeRole(role), req.params.id);
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
  const panelTemplates = db.prepare('SELECT * FROM panel_templates ORDER BY name').all();
  res.render('admin/competition-form', { competition: null, action: '/admin/competitions', panelTemplates });
});

router.post('/competitions', (req, res) => {
  const { name, date, panel_template_id } = req.body;
  if (!name || !name.trim()) {
    const panelTemplates = db.prepare('SELECT * FROM panel_templates ORDER BY name').all();
    return res.status(400).render('admin/competition-form', {
      competition: null, action: '/admin/competitions', panelTemplates,
      error: 'Competition name is required.',
    });
  }
  db.prepare('INSERT INTO competitions (name,date,panel_template_id) VALUES (?,?,?)')
    .run(name.trim(), date || null, panel_template_id || null);
  req.session.flash = { success: `Competition "${name}" created.` };
  res.redirect('/admin/competitions');
});

router.get('/competitions/:id/edit', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Not found');
  const panelTemplates = db.prepare('SELECT * FROM panel_templates ORDER BY name').all();
  res.render('admin/competition-form', { competition, action: `/admin/competitions/${competition.id}`, panelTemplates });
});

router.post('/competitions/:id', (req, res) => {
  const { name, date, panel_template_id } = req.body;
  if (!name || !name.trim()) {
    const panelTemplates = db.prepare('SELECT * FROM panel_templates ORDER BY name').all();
    return res.status(400).render('admin/competition-form', {
      competition: null, action: '/admin/competitions', panelTemplates,
      error: 'Competition name is required.',
    });
  }
  db.prepare('UPDATE competitions SET name=?,date=?,panel_template_id=? WHERE id=?')
    .run(name, date || null, panel_template_id || null, req.params.id);
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


// ── Judges ───────────────────────────────────────────────────────────────────

// Groups a panel template's slots by shared_assignment_group (slots that must be filled by the
// same person, e.g. time_of_flight + horizontal_displacement), falling back to a solo group per
// slot for everything else. Returns an array in slot/sort_order.
function groupPanelSlots(panelTemplateId) {
  const slots = db.prepare(`
    SELECT s.judge_role_id, s.judge_count, s.shared_assignment_group, jr.key AS role_key, jr.name AS role_name
    FROM panel_template_slots s
    JOIN judge_roles jr ON jr.id = s.judge_role_id
    WHERE s.panel_template_id = ?
    ORDER BY s.sort_order
  `).all(panelTemplateId);

  const groups = new Map();
  for (const slot of slots) {
    const groupKey = slot.shared_assignment_group || `solo_${slot.judge_role_id}`;
    if (!groups.has(groupKey)) {
      groups.set(groupKey, { groupKey, judgeRoleIds: [], names: [], required: slot.judge_count, roleKey: slot.role_key });
    }
    const group = groups.get(groupKey);
    group.judgeRoleIds.push(slot.judge_role_id);
    group.names.push(slot.role_name);
  }
  return [...groups.values()];
}

// Resolves the full shared-assignment group (all sibling judge_role_ids) a given judge_role_id
// belongs to, for the given panel template.
function resolveAssignmentGroup(panelTemplateId, judgeRoleId) {
  return groupPanelSlots(panelTemplateId).find(g => g.judgeRoleIds.includes(judgeRoleId));
}

router.get('/competitions/:id/judges', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');

  if (!competition.panel_template_id) {
    return res.render('admin/judges', { competition, panelTemplate: null, roles: [] });
  }

  const panelTemplate = db.prepare('SELECT * FROM panel_templates WHERE id=?').get(competition.panel_template_id);
  const groups = groupPanelSlots(competition.panel_template_id);

  const candidateQuery = db.prepare('SELECT id, name, email FROM users WHERE role = ? ORDER BY name');
  // A user may only hold one role (one shared-assignment group) per competition, so anyone
  // already assigned to ANY role here is ineligible for every other role's candidate list.
  const assignedAnywhereIds = new Set(
    db.prepare('SELECT DISTINCT user_id FROM panel_assignments WHERE competition_id = ?').all(competition.id).map(r => r.user_id)
  );

  const roles = groups.map(group => {
    const placeholders = group.judgeRoleIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT pa.id AS assignment_id, pa.judge_role_id, u.id AS user_id, u.name, u.email
      FROM panel_assignments pa
      JOIN users u ON u.id = pa.user_id
      WHERE pa.competition_id = ? AND pa.judge_role_id IN (${placeholders})
      ORDER BY u.name
    `).all(competition.id, ...group.judgeRoleIds);

    const byUser = new Map();
    for (const row of rows) {
      if (!byUser.has(row.user_id)) byUser.set(row.user_id, { user_id: row.user_id, name: row.name, email: row.email, assignment_id: row.assignment_id, roleIds: new Set() });
      byUser.get(row.user_id).roleIds.add(row.judge_role_id);
    }
    // Only users covering EVERY role in the group count as fully assigned to it.
    const assigned = [...byUser.values()].filter(u => u.roleIds.size === group.judgeRoleIds.length);
    const eligibleRole = group.roleKey === 'head_judge' ? 'head_judge' : 'referee';
    const candidates = candidateQuery.all(eligibleRole).filter(u => !assignedAnywhereIds.has(u.id));

    return {
      groupKey: group.groupKey,
      judgeRoleId: group.judgeRoleIds[0], // representative id posted back on assign
      name: group.names.join(' & '),
      required: group.required,
      assigned,
      candidates,
    };
  });

  res.render('admin/judges', { competition, panelTemplate, roles });
});

router.post('/competitions/:id/judges', (req, res) => {
  const { judge_role_id, user_id } = req.body;
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');

  const group = resolveAssignmentGroup(competition.panel_template_id, Number(judge_role_id));
  if (!group) return res.status(400).send('Unknown role for this competition\'s panel.');
  const anchor = `#role-${group.groupKey}`;

  // A user may only hold one role (one shared-assignment group) per competition.
  const alreadyAssignedElsewhere = db.prepare(
    'SELECT 1 FROM panel_assignments WHERE competition_id = ? AND user_id = ? AND judge_role_id NOT IN (' +
      group.judgeRoleIds.map(() => '?').join(',') + ')'
  ).get(competition.id, user_id, ...group.judgeRoleIds);
  if (alreadyAssignedElsewhere) {
    req.session.flash = { error: 'This user is already assigned to another judge role in this competition.' };
    return res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
  }

  const placeholders = group.judgeRoleIds.map(() => '?').join(',');
  const fullyAssignedCount = db.prepare(`
    SELECT COUNT(*) AS n FROM (
      SELECT user_id FROM panel_assignments
      WHERE competition_id = ? AND judge_role_id IN (${placeholders})
      GROUP BY user_id HAVING COUNT(DISTINCT judge_role_id) = ?
    )
  `).get(competition.id, ...group.judgeRoleIds, group.judgeRoleIds.length).n;

  if (fullyAssignedCount >= group.required) {
    req.session.flash = { error: `${group.names.join(' & ')} is already fully staffed.` };
    return res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
  }

  try {
    const insert = db.prepare('INSERT INTO panel_assignments (competition_id,judge_role_id,user_id) VALUES (?,?,?)');
    db.transaction(() => {
      for (const roleId of group.judgeRoleIds) insert.run(competition.id, roleId, user_id);
    })();
    req.session.flash = { success: 'Judge assigned.' };
  } catch {
    req.session.flash = { error: 'This judge is already assigned to that role.' };
  }
  res.redirect(`/admin/competitions/${competition.id}/judges${anchor}`);
});

router.post('/competitions/:id/judges/:assignmentId/delete', (req, res) => {
  const competition = db.prepare('SELECT * FROM competitions WHERE id=?').get(req.params.id);
  if (!competition) return res.status(404).send('Competition not found');

  const assignment = db.prepare('SELECT * FROM panel_assignments WHERE id=? AND competition_id=?')
    .get(req.params.assignmentId, competition.id);
  if (!assignment) return res.status(404).send('Assignment not found');

  const group = resolveAssignmentGroup(competition.panel_template_id, assignment.judge_role_id);
  const anchor = group ? `#role-${group.groupKey}` : '';

  if (group) {
    const placeholders = group.judgeRoleIds.map(() => '?').join(',');
    db.prepare(`DELETE FROM panel_assignments WHERE competition_id=? AND user_id=? AND judge_role_id IN (${placeholders})`)
      .run(competition.id, assignment.user_id, ...group.judgeRoleIds);
  } else {
    db.prepare('DELETE FROM panel_assignments WHERE id=? AND competition_id=?').run(assignment.id, competition.id);
  }
  req.session.flash = { success: 'Judge unassigned.' };
  res.redirect(`/admin/competitions/${req.params.id}/judges${anchor}`);
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
    SELECT s.name, s.club, s.gender, s.birth_year, s.routine, g.abbreviation AS group_abbreviation
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
    Group: s.group_abbreviation || '',
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
  const insert = db.prepare('INSERT INTO sportsmen (name,club,gender,birth_year,routine,competition_id,group_id) VALUES (?,?,?,?,?,?,?)');
  const lookupGroup = db.prepare('SELECT id FROM groups WHERE competition_id=? AND abbreviation=?');
  const insertAll = db.transaction(() => {
    let created = 0, skipped = 0, unknownGroup = 0;
    for (const row of rows) {
      const name = String(row['Name'] || row['name'] || '').trim();
      if (!name) { skipped++; continue; }
      const club = String(row['Club'] || row['club'] || '').trim() || null;
      const gender = String(row['Gender'] || row['gender'] || '').trim() || null;
      const birth_year_raw = String(row['Birthyear'] || row['Birth Year'] || row['birth_year'] || '').trim();
      const birth_year = birth_year_raw ? parseInt(birth_year_raw) : null;
      const routine = String(row['Routine'] || row['routine'] || '').trim() || null;
      const abbrev = String(row['Group'] || row['group'] || '').trim();
      const group_id = abbrev ? (lookupGroup.get(req.params.id, abbrev)?.id || null) : null;
      if (abbrev && !group_id) unknownGroup++;
      insert.run(name, club, gender, birth_year, routine, req.params.id, group_id);
      created++;
    }
    return { created, skipped, unknownGroup };
  });
  const { created, skipped, unknownGroup } = insertAll();
  const parts = [`${created} added`, `${skipped} skipped (missing name)`];
  if (unknownGroup > 0) parts.push(`${unknownGroup} without group (unknown abbreviation)`);
  req.session.flash = { success: `Import complete: ${parts.join(', ')}.` };
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
  const { name, abbreviation } = req.body;
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
  if (!abbreviation || !abbreviation.trim()) {
    const groups = db.prepare(`
      SELECT g.*, COUNT(r.id) AS round_count
      FROM groups g LEFT JOIN rounds r ON r.group_id = g.id
      WHERE g.competition_id = ? GROUP BY g.id ORDER BY g.name
    `).all(req.params.id);
    return res.status(400).render('admin/groups', { competition, groups, error: 'Group abbreviation is required.' });
  }
  try {
    db.prepare('INSERT INTO groups (name, abbreviation, competition_id) VALUES (?, ?, ?)').run(name.trim(), abbreviation.trim(), req.params.id);
  } catch {
    const groups = db.prepare(`
      SELECT g.*, COUNT(r.id) AS round_count
      FROM groups g LEFT JOIN rounds r ON r.group_id = g.id
      WHERE g.competition_id = ? GROUP BY g.id ORDER BY g.name
    `).all(req.params.id);
    return res.status(422).render('admin/groups', { competition, groups, error: `Abbreviation "${abbreviation.trim()}" is already used by another group in this competition.` });
  }
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

  // If a previous round exists in this group, rank available athletes by their placement there
  const prevRound = db.prepare(`
    SELECT id, name FROM rounds
    WHERE group_id = ? AND round_order < ?
    ORDER BY round_order DESC LIMIT 1
  `).get(round.group_id, round.round_order);

  if (prevRound) {
    const panelSlots = loadPanelSlots(competition.panel_template_id);

    const attemptRows = db.prepare(`
      SELECT a.id AS attempt_id, a.element_count, e.sportsman_id
      FROM entries e
      JOIN attempts a ON a.entry_id = e.id
      WHERE e.round_id = ?
      ORDER BY e.sportsman_id, a.attempt_number
    `).all(prevRound.id);

    const scoreRows = db.prepare(`
      SELECT s.attempt_id, s.judge_role_id, s.score
      FROM scores s JOIN attempts a ON a.id = s.attempt_id JOIN entries e ON e.id = a.entry_id
      WHERE e.round_id = ?
    `).all(prevRound.id);
    const elementScoreRows = db.prepare(`
      SELECT es.attempt_id, es.judge_role_id, es.element_number, es.value
      FROM element_scores es JOIN attempts a ON a.id = es.attempt_id JOIN entries e ON e.id = a.entry_id
      WHERE e.round_id = ?
    `).all(prevRound.id);

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

    const spMap = new Map();
    for (const row of attemptRows) {
      if (!spMap.has(row.sportsman_id)) spMap.set(row.sportsman_id, []);
      const scoresByJudgeRoleId = scoresByAttempt.get(row.attempt_id) || new Map();
      const elementScoresByJudgeRoleId = elementScoresByAttempt.get(row.attempt_id) || new Map();
      const hasAnyScore = scoresByJudgeRoleId.size > 0 || elementScoresByJudgeRoleId.size > 0;
      if (!hasAnyScore) continue;
      const { total } = computeAttemptScore(panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, row.element_count);
      spMap.get(row.sportsman_id).push(total);
    }

    const ranked = [];
    for (const [spId, scores] of spMap) {
      ranked.push({ spId, bestScore: scores.length > 0 ? Math.max(...scores) : null });
    }
    ranked.sort((a, b) => {
      if (a.bestScore === null && b.bestScore === null) return 0;
      if (a.bestScore === null) return 1;
      if (b.bestScore === null) return -1;
      return b.bestScore - a.bestScore;
    });

    const rankMap = new Map();
    let rank = 1;
    for (let i = 0; i < ranked.length; i++) {
      if (ranked[i].bestScore !== null) {
        if (i > 0 && ranked[i].bestScore !== ranked[i - 1].bestScore) rank = i + 1;
        rankMap.set(ranked[i].spId, rank);
      }
    }

    available.forEach(s => { s.prevRank = rankMap.get(s.id) ?? null; });
    available.sort((a, b) => {
      if (a.prevRank === null && b.prevRank === null) return a.name.localeCompare(b.name);
      if (a.prevRank === null) return 1;
      if (b.prevRank === null) return -1;
      return a.prevRank - b.prevRank;
    });
  }

  res.render('admin/entries', { round, entries, available, prevRound: prevRound || null });
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

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries/add-all', (req, res) => {
  const { cid, gid, rid } = req.params;
  const round = db.prepare(`
    SELECT r.*, g.competition_id
    FROM rounds r JOIN groups g ON g.id = r.group_id
    WHERE r.id = ? AND r.group_id = ?
  `).get(rid, gid);
  if (!round) return res.status(404).send('Round not found');

  const available = db.prepare(`
    SELECT id FROM sportsmen
    WHERE competition_id = ?
      AND id NOT IN (SELECT sportsman_id FROM entries WHERE round_id = ?)
    ORDER BY name
  `).all(round.competition_id, rid);

  const maxOrder = db.prepare('SELECT MAX(start_order) AS max FROM entries WHERE round_id=?').get(rid);
  let nextOrder = (maxOrder.max || 0) + 1;

  const insert = db.prepare('INSERT INTO entries (round_id,sportsman_id,start_order) VALUES (?,?,?)');
  db.transaction(() => { for (const sp of available) insert.run(rid, sp.id, nextOrder++); })();

  req.session.flash = { success: `${available.length} athlete(s) added to the round.` };
  res.redirect(`/admin/competitions/${cid}/groups/${gid}/rounds/${rid}/entries`);
});

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries/randomize', (req, res) => {
  const { cid, gid, rid } = req.params;
  const round = db.prepare(`
    SELECT r.*, g.competition_id
    FROM rounds r JOIN groups g ON g.id = r.group_id
    WHERE r.id = ? AND r.group_id = ?
  `).get(rid, gid);
  if (!round) return res.status(404).send('Round not found');

  const entries = db.prepare('SELECT id FROM entries WHERE round_id = ?').all(rid);

  for (let i = entries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [entries[i], entries[j]] = [entries[j], entries[i]];
  }

  const update = db.prepare('UPDATE entries SET start_order = ? WHERE id = ?');
  db.transaction(() => { entries.forEach((e, i) => update.run(i + 1, e.id)); })();

  req.session.flash = { success: `Start order randomized.` };
  res.redirect(`/admin/competitions/${cid}/groups/${gid}/rounds/${rid}/entries`);
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
