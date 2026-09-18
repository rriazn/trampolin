const express = require('express');
const session = require('express-session');
const i18next = require('i18next');
const i18nextMiddleware = require('i18next-http-middleware');
const SQLiteStore = require('connect-sqlite3')(session);
const path = require('path');
const { getAppVersion } = require('./services/version.service');
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

const NAMESPACES = ['common', 'login', 'admin', 'referee', 'headJudge', 'leaderboard', 'errors'];
const loadNamespaces = (lng) => Object.fromEntries(
  NAMESPACES.map(ns => [ns, require(`./locales/${lng}/${ns}.json`)])
);

i18next.use(i18nextMiddleware.LanguageDetector).init({
  fallbackLng: 'en',
  preload: ['en', 'de'],
  ns: NAMESPACES,
  defaultNS: 'common',
  resources: {
    en: loadNamespaces('en'),
    de: loadNamespaces('de'),
  },
  detection: {
    order: ['session'],
    lookupSession: 'lng',
    caches: ['session'],
  },
});
app.use(i18nextMiddleware.handle(i18next));

app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || {};
  res.locals.appVersion = appVersion;
  res.locals.currentUrl = req.originalUrl;
  delete req.session.flash;
  next();
});

app.get('/', (req, res) => {
  if (req.session.user) {
    const landing = { admin: '/admin', head_judge: '/head-judge', referee: '/referee' }[req.session.user.role] || '/referee';
    return res.redirect(landing);
  }
  res.redirect('/login');
});

app.use('/', require('./routes/auth'));
app.use('/', require('./routes/language'));
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
