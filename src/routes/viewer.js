const router = require('express').Router();
const { requireViewer } = require('../middleware/auth');
const viewerController = require('../controllers/viewer.controller');

router.use(requireViewer);

router.get('/', viewerController.getViewerDashboard);

module.exports = router;