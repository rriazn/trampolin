const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const { getAppVersion } = require('./services/version');
require('./db/database');

const app = express();

const appVersion = getAppVersion();

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
  res.locals.appVersion = appVersion;
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) {
    const landing = { admin: '/admin', head_judge: '/head-judge' }[req.session.user.role] || '/referee';
    return res.redirect(landing);
  }
  res.redirect('/login');
});

app.use('/', require('./routes/auth'));
if (process.env.ENABLE_TEST_SEED === 'true') {
  app.use('/', require('./routes/test-seed'));
}
app.use('/admin', require('./routes/admin'));
app.use('/referee', require('./routes/referee'));
app.use('/head-judge', require('./routes/head-judge'));
app.use('/leaderboard', require('./routes/leaderboard'));

app.use((req, res) => {
  res.status(404).render('errors/404');
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('errors/500');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Trampolin running on http://localhost:${PORT}`));
