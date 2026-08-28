const { getUserByEmail } = require("../services/db/users.crud");
const bcrypt = require('bcryptjs');
 
exports.getLoginForm = (req, res) => {
    if (req.session.user) return res.redirect('/');
    res.render('login', { error: null });
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    const user = getUserByEmail(email);
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return res.render('login', { error: 'Invalid email or password' });
    }
    req.session.regenerate((err) => {
        if (err) throw err;
        req.session.user = { id: user.id, name: user.name, role: user.role };
        const landing = { admin: '/admin', head_judge: '/head-judge' }[user.role] || '/referee';
        res.redirect(landing);
    });
};

exports.logout = (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
};
