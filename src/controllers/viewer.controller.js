const { getOrderedRoundGroupCompInfoAdmin } = require("../services/db/rounds.crud");

exports.getViewerDashboard = (req, res) => {
    const rounds = getOrderedRoundGroupCompInfoAdmin();
    res.render('viewer/dashboard', { rounds });
};
