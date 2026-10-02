const { getSportsmenCount } = require("../db/sportsmen.crud");
const { getUserCount } = require("../db/users.crud");
const { getCompetitionCount } = require("../db/competitions.crud");


exports.getAdminStats = () => {
    return {
        users: getUserCount(),
        sportsmen: getSportsmenCount(),
        competitions: getCompetitionCount(),
    };
}

// safe lowercase file name part from a competition name
exports.fileNameSlug = (name) => name
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // eslint-disable-line no-control-regex
    .replace(/\s+/g, '-')
    .replace(/\.+$/, '')
    .trim();
