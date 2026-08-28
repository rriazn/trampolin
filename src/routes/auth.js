const router = require('express').Router();
const authController = require('../controllers/auth.controller');

router.get('/login', authController.getLoginForm);

router.post('/login', authController.login);

router.post('/logout', authController.logout);

module.exports = router;
