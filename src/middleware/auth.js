const crypto = require('crypto');
const { renderForbidden } = require('../services/errors.service');
const { getUserTokenVersion } = require('../services/db/users.crud');

// Regenerated once per process start so any session issued by a previous run is rejected
const APP_EPOCH = crypto.randomUUID();
exports.APP_EPOCH = APP_EPOCH;

exports.checkSessionValidity = (req, res, next) => {
  if (!req.session.user) return next();
  const currentVersion = getUserTokenVersion(req.session.user.id);
  const isStale = req.session.epoch !== APP_EPOCH || req.session.tokenVersion !== currentVersion;
  if (!isStale) return next();
  req.session.destroy(() => res.redirect('/login?reason=expired'));
};

exports.requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin')
    return renderForbidden(res);
  next();
};

exports.requireReferee = (req, res, next) => {
  if (!req.session.user || !['admin', 'referee', 'head_judge'].includes(req.session.user.role))
    return renderForbidden(res);
  next();
};

exports.requireHeadJudge = (req, res, next) => {
  if (!req.session.user || !['admin', 'head_judge'].includes(req.session.user.role))
    return renderForbidden(res);
  next();
};

exports.requireViewer = (req, res, next) => {
  if (!req.session.user || !['admin', 'referee', 'head_judge', 'viewer'].includes(req.session.user.role))
    return renderForbidden(res);
  next();
};