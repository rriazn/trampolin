'use strict';
const express = require('express');
const router = express.Router();
const testSeedController = require('../controllers/test-seed.controller');

router.post('/test/seed', express.json(), testSeedController.seedTestData);

module.exports = router;
