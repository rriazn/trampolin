const { createUser } = require('./services/users.service');
const { getFirstAdminUser } = require('./services/db/users.crud');

// creates the first admin from the environment, does nothing when an admin exists
async function initAdmin(env = process.env) {
  if (getFirstAdminUser()) {
    console.log('Admin already exists, skipping.');
    return false;
  }
  const email = env.ADMIN_EMAIL || 'admin@example.com';
  const password = env.ADMIN_PASSWORD || 'admin123';
  await createUser(env.ADMIN_NAME || 'Administrator', email, password, 'admin');
  console.log(`Created admin: ${email}`);
  return true;
}

module.exports = initAdmin;

if (require.main === module) {
  initAdmin().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
