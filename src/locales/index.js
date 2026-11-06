const fs = require('fs');
const path = require('path');

// every folder next to this file is a language
const LANGUAGES = fs.readdirSync(__dirname, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);

const loadNamespace = (lng, ns) => require(path.join(__dirname, lng, `${ns}.json`));

module.exports = { LANGUAGES, loadNamespace };
