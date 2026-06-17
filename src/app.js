const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
require('./db/database');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-prod',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) {
    return res.redirect(req.session.user.role === 'admin' ? '/admin' : '/referee');
  }
  res.redirect('/login');
});

app.use('/', require('./routes/auth'));
if (process.env.ENABLE_TEST_SEED === 'true') {
  app.use('/', require('./routes/test-seed'));
}
app.use('/admin', require('./routes/admin'));
app.use('/referee', require('./routes/referee'));
app.use('/leaderboard', require('./routes/leaderboard'));

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).send(`<h1>Error</h1><pre>${err.message}</pre><a href="/">Back</a>`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trampolin running on http://localhost:${PORT}`));
