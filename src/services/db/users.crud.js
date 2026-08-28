const db = require('../../db/database');


exports.getUserCount = () => {
    return db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='referee'").get().n;
}

exports.getUsers = () => {
    return db.prepare("SELECT id,name,email,role,created_at FROM users ORDER BY name").all();
}

exports.getUserById = (id) => {
    return db.prepare('SELECT id,name,email,role FROM users WHERE id=?').get(id);
};

exports.getUserByEmail = (email) => {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
};

exports.getUsersByRole = (role) => {
    return db.prepare('SELECT id, name, email FROM users WHERE role = ? ORDER BY name').all(role);
};

exports.createUserDB = (name, email, passwordHash, role) => {
    return db.prepare('INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
        .run(name, email, passwordHash, role);
};

exports.getFirstAdminUser = () => {
    return db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get();
};

exports.createOrIgnoreUserDB = (name, email, passwordHash, role) => {
    return db.prepare('INSERT OR IGNORE INTO users (name,email,password_hash,role) VALUES (?,?,?,?)')
        .run(name, email, passwordHash, role);
};

exports.updateUserDB = (id, name, email, role) => {
    db.prepare('UPDATE users SET name=?,email=?,role=? WHERE id=?')
            .run(name, email, role, id);
};

exports.updateUserPasswordDB = (id, name, email, passwordHash, role) => {
    db.prepare('UPDATE users SET name=?,email=?,password_hash=?,role=? WHERE id=?')
            .run(name, email, passwordHash, role, id);
};

exports.deleteUserDB = (id) => {
    db.prepare('DELETE FROM users WHERE id=?').run(id);
}

exports.deleteAllUsersDB = () => {
    db.prepare('DELETE FROM users').run();
};