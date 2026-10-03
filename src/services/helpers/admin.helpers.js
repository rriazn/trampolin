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

// letters with no accent form, as ASCII
const TRANSLITERATIONS = { 'ß': 'ss', 'ø': 'o', 'đ': 'd', 'ð': 'd', 'ł': 'l', 'æ': 'ae', 'œ': 'oe', 'þ': 'th' };

// safe lowercase ASCII file name part from a name, the fallback is used when nothing is left (e.g. Cyrillic or CJK names)
exports.fileNameSlug = (name, fallback = 'file') => name
    .toLowerCase()
    .replace(/[ßøđðłæœþ]/g, (letter) => TRANSLITERATIONS[letter])
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '') // eslint-disable-line no-control-regex
    .replace(/\s+/g, '-')
    .replace(/\.+$/, '')
    .trim() || fallback;
