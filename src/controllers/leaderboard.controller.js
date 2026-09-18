const { getCompetitionById } = require("../services/db/competitions.crud");
const { getGroupById } = require("../services/db/groups.crud");
const { getRoundByIdWithCompGroupInfo } = require("../services/db/rounds.crud");
const { buildLeaderboard } = require("../services/leaderboard.service");
const { renderNotFound } = require("../services/errors.service");

exports.getLeaderboard = (req, res) => {
    const { cid, gid, rid } = req.params;

    const competition = getCompetitionById(cid);
    if (!competition) return renderNotFound(res, req.t('errors:notFound.competition'));

    const group = getGroupById(gid);
    if (!group) return renderNotFound(res, req.t('errors:notFound.group'));

    const round = getRoundByIdWithCompGroupInfo(rid, gid);
    if (!round) return renderNotFound(res, req.t('errors:notFound.round'));

    const { leaderboard, maxAttempts, panelSlots } = buildLeaderboard(competition, round);

    res.render('leaderboard', {
        round,
        leaderboard,
        maxAttempts,
        autoRefresh: true,
        panelConfigured: panelSlots.length > 0,
    });
};