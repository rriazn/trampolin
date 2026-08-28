'use strict';
const { seedTestData } = require('../services/test-seed');

exports.seedTestData = async (req, res) => {
  const result = await seedTestData();
  res.json(result);
};
