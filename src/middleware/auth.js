exports.requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/login');
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.session.user || req.session.user.role !== 'admin')
    return res.status(403).send('Forbidden');
  next();
};

exports.requireReferee = (req, res, next) => {
  if (!req.session.user || !['admin', 'referee', 'head_judge'].includes(req.session.user.role))
    return res.status(403).send('Forbidden');
  next();
};

exports.requireHeadJudge = (req, res, next) => {
  if (!req.session.user || !['admin', 'head_judge'].includes(req.session.user.role))
    return res.status(403).send('Forbidden');
  next();
};

exports.requireViewer = (req, res, next) => {
  if (!req.session.user || !['admin', 'referee', 'head_judge', 'viewer'].includes(req.session.user.role))
    return res.status(403).send('Forbidden');
  next();
};