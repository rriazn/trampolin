const express = require('express');
const path = require('path');

// front-end libraries served from node_modules so the app works without internet
const router = express.Router();
const modules = path.join(__dirname, '../../node_modules');

router.use('/bootstrap', express.static(path.join(modules, 'bootstrap/dist')));
router.use('/bootstrap-icons', express.static(path.join(modules, 'bootstrap-icons/font')));
router.use('/inter', express.static(path.join(modules, '@fontsource-variable/inter/files')));

module.exports = router;
