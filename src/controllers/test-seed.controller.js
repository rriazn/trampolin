'use strict';
const { seedTestData } = require('../services/test-seed.service');

exports.seedTestData = async (req, res) => {
  const result = await seedTestData(req.body);
  res.json(result);
};
