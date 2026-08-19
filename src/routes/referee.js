const router = require('express').Router();
const { requireReferee } = require('../middleware/auth');
const refereeController = require('../controllers/referee.controller');

router.use(requireReferee);

router.get('/', refereeController.getRefereeDashboard);

router.get('/competitions/:cid/groups/:gid/rounds/:rid', refereeController.getRound);

router.post('/score', refereeController.postScore);

router.post('/score/elements', refereeController.postElementScores);

module.exports = router;
