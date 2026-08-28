const { getSportsmenCount } = require("./db/sportsmen.crud");
const { getUserCount } = require("./db/users.crud");
const { getCompetitionCount } = require("./db/competitions.crud");


exports.getAdminStats = () => {
    return {
        users: getUserCount(),
        sportsmen: getSportsmenCount(),
        competitions: getCompetitionCount(),
    };
}