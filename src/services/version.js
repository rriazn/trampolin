const fs = require('fs');
const path = require('path');

const DEFAULT_VERSION_PATH = path.join(__dirname, '..', '..', 'VERSION');

exports.getAppVersion = (versionPath = DEFAULT_VERSION_PATH) => {
    return fs.existsSync(versionPath) ? fs.readFileSync(versionPath, 'utf8').trim() : 'latest';
};
