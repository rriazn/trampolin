const { getUserByEmail } = require("../services/db/users.crud");
const { APP_EPOCH } = require("../middleware/auth");
const bcrypt = require('bcryptjs');

exports.getLoginForm = (req, res) => {
    if (req.session.user) return res.redirect('/');
    const error = req.query.reason === 'expired' ? req.t('login:sessionExpired') : null;
    res.render('login', { error });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    const user = getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.render('login', { error: req.t('login:invalidCredentials') });
    }
    const lng = req.session.lng;
    req.session.regenerate((err) => {
        if (err) throw err;
        req.session.user = { id: user.id, name: user.name, role: user.role };
        req.session.epoch = APP_EPOCH;
        req.session.tokenVersion = user.token_version;
        if (lng) req.session.lng = lng;
        const landing = { admin: '/admin', head_judge: '/head-judge', referee: '/referee', viewer: '/viewer' }[user.role] || '/referee';
        res.redirect(landing);
    });
};

exports.logout = (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
};
