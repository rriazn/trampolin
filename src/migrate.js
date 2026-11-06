// opening the database creates missing tables, runs the migrations and seeds the defaults
require('./db/database');
console.log('Database is up to date.');
