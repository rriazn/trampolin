const express = require('express');
const { assetHeaders, vendorDirs } = require('./assets');

// front-end libraries served from node_modules so the app works without internet
const router = express.Router();

Object.entries(vendorDirs).forEach(([name, dir]) => {
  router.use(`/${name}`, express.static(dir, { setHeaders: assetHeaders }));
});

module.exports = router;
