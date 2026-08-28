'use strict';
const router = require('express').Router();
const testSeedController = require('../controllers/test-seed.controller');

router.post('/test/seed', testSeedController.seedTestData);

module.exports = router;
