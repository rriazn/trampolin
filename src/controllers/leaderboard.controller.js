const { getCompetitionById } = require("../services/db/competitions.crud");
const { getGroupById } = require("../services/db/groups.crud");
const { getRoundByIdWithCompGroupInfo } = require("../services/db/rounds.crud");
const { buildLeaderboard } = require("../services/leaderboard.services");
const { renderNotFound } = require("../services/errors");

exports.getLeaderboard = (req, res) => {
    const { cid, gid, rid } = req.params;

    const competition = getCompetitionById(cid);
    if (!competition) return renderNotFound(res, 'Competition not found');

    const group = getGroupById(gid);
    if (!group) return renderNotFound(res, 'Group not found');

    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) return renderNotFound(res, 'Round not found');

    const { leaderboard, maxAttempts, panelSlots } = buildLeaderboard(competition, round);

    res.render('leaderboard', {
        round,
        leaderboard,
        maxAttempts,
        autoRefresh: true,
        panelConfigured: panelSlots.length > 0,
    });
};