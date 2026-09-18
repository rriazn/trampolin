const router = require('express').Router();
const { requireViewer } = require('../middleware/auth');
const leaderboardController = require('../controllers/leaderboard.controller');

router.use(requireViewer);

router.get('/competitions/:cid/groups/:gid/rounds/:rid', leaderboardController.getLeaderboard);

module.exports = router;
