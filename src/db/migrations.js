const COMPETITION_TYPES = "('individual','synchro')";

// CREATE TABLE IF NOT EXISTS never alters an existing table, so new columns are added here
function addColumnIfMissing(db, table, column, ddl) {
  const exists = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!exists) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
}

function runMigrations(db) {
  addColumnIfMissing(db, 'competitions', 'type', `TEXT NOT NULL DEFAULT 'individual' CHECK(type IN ${COMPETITION_TYPES})`);
  addColumnIfMissing(db, 'panel_templates', 'competition_type', `TEXT NOT NULL DEFAULT 'individual' CHECK(competition_type IN ${COMPETITION_TYPES})`);
  addColumnIfMissing(db, 'judge_roles', 'has_landing', 'INTEGER NOT NULL DEFAULT 0 CHECK(has_landing IN (0,1))');
  addColumnIfMissing(db, 'sportsmen', 'partner_name', 'TEXT');
  addColumnIfMissing(db, 'sportsmen', 'partner_club', 'TEXT');
  addColumnIfMissing(db, 'sportsmen', 'partner_gender', "TEXT CHECK(partner_gender IN ('m','f'))");
  addColumnIfMissing(db, 'sportsmen', 'partner_birth_year', 'INTEGER');
}

module.exports = { addColumnIfMissing, runMigrations };
