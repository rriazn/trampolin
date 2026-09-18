const router = require('express').Router();
const languageController = require('../controllers/language.controller');

router.post('/language/:lng', languageController.setLanguage);

module.exports = router;
