const SUPPORTED_LANGUAGES = ['en', 'de'];

exports.setLanguage = (req, res) => {
    if (SUPPORTED_LANGUAGES.includes(req.params.lng)) {
        req.session.lng = req.params.lng;
    }
    const to = req.body.from;
    res.redirect(to && to.startsWith('/') && !to.startsWith('//') ? to : '/');
};
