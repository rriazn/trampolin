'use strict';
const router = require('express').Router();
const multer = require('multer');
const { requireAdmin } = require('../middleware/auth');
const adminController = require('../controllers/admin.controller');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAdmin);

// ── Dashboard ────────────────────────────────────────────────────────────────────
router.get('/', adminController.getDashboard);

// ── Users ────────────────────────────────────────────────────────────────────

router.get('/users', adminController.getUsers);

router.get('/users/export', adminController.exportUsers);

router.get('/users/new', adminController.getNewUserForm);

router.post('/users', adminController.addUser);

router.get('/users/:id/edit', adminController.getEditUserForm);

router.post('/users/upload', upload.single('file'), adminController.uploadUsers);

router.post('/users/:id/delete', adminController.deleteUser);

router.post('/users/:id', adminController.updateUser);


// ── Competitions ─────────────────────────────────────────────────────────────

router.get('/competitions', adminController.getCompetitions);

router.get('/competitions/new', adminController.getNewCompetitionForm);

router.post('/competitions', adminController.addCompetition);

router.get('/competitions/:id/edit', adminController.getEditCompetitionForm);

router.post('/competitions/:id', adminController.updateCompetition);

router.post('/competitions/:id/status', adminController.updateCompetitionStatus);

router.post('/competitions/:id/delete', adminController.deleteCompetition);


// ── Judges ───────────────────────────────────────────────────────────────────

router.get('/competitions/:id/judges', adminController.getJudges);

router.post('/competitions/:id/judges', adminController.addJudge);

router.post('/competitions/:id/judges/:assignmentId/delete', adminController.removeJudge);


// ── Sportsmen ────────────────────────────────────────────────────────────────

router.get('/competitions/:id/sportsmen', adminController.getSportsmen);

router.get('/competitions/:id/sportsmen/export', adminController.exportSportsmen);

router.get('/competitions/:id/sportsmen/new', adminController.getNewSportsmanForm);

router.post('/competitions/:id/sportsmen', adminController.addSportsman);

router.get('/competitions/:id/sportsmen/:sid/edit', adminController.getEditSportsmanForm);

router.post('/competitions/:id/sportsmen/:sid/delete', adminController.deleteSportsman);

router.post('/competitions/:id/sportsmen/upload', upload.single('file'), adminController.uploadSportsmen);

router.post('/competitions/:id/sportsmen/:sid', adminController.updateSportsman);

// ── Groups ───────────────────────────────────────────────────────────────────

router.get('/competitions/:id/groups', adminController.getGroups);

router.post('/competitions/:id/groups', adminController.addGroup);

router.post('/competitions/:id/groups/:gid/delete', adminController.deleteGroup);

// ── Rounds ───────────────────────────────────────────────────────────────────

router.get('/competitions/:cid/groups/:gid/rounds', adminController.getRounds);

router.post('/competitions/:cid/groups/:gid/rounds', adminController.addRound);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/delete', adminController.deleteRound);

// ── Entries ──────────────────────────────────────────────────────────────────

router.get('/competitions/:cid/groups/:gid/rounds/:rid/entries', adminController.getEntries);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries', adminController.addEntry);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries/add-all', adminController.addAllEntries);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries/randomize', adminController.randomizeEntries);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/entries/:eid/delete', adminController.removeEntry);

router.post('/competitions/:cid/groups/:gid/rounds/:rid/attempts/bulk', adminController.addAttempts);

module.exports = router;
