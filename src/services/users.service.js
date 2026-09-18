const bcrypt = require("bcryptjs");
const { createUserDB, updateUserPasswordDB, updateUserDB } = require("./db/users.crud");

const normalizeRole = (role) => ['admin', 'head_judge', 'viewer'].includes(role) ? role : 'referee';
exports.normalizeRole = normalizeRole;

exports.createUser = async (name, email, password, role) => {
    const hash = await bcrypt.hash(password, 12);
    createUserDB(name, email, hash, normalizeRole(role));
};

exports.updateUser = async (id, name, email, password, role) => {
    if (password) {
        const hash = await bcrypt.hash(password, 12);
        updateUserPasswordDB(id, name, email, hash, normalizeRole(role));
    } else {
        updateUserDB(id, name, email, normalizeRole(role));
    }
};
