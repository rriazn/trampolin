const router = require('express').Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.render('login', { error: 'Invalid email or password' });
  }
  req.session.regenerate((err) => {
    if (err) throw err;
    req.session.user = { id: user.id, name: user.name, role: user.role };
    res.redirect(user.role === 'admin' ? '/admin' : '/referee');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;
