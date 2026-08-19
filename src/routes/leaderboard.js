const router = require('express').Router();
const leaderboardController = require('../controllers/leaderboard.controller');

router.get('/competitions/:cid/groups/:gid/rounds/:rid', leaderboardController.getLeaderboard);

module.exports = router;
