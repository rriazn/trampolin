'use strict';
const { seedTestData } = require('../services/test-seed.service');

exports.seedTestData = async (req, res) => {
  const result = await seedTestData();
  res.json(result);
};
