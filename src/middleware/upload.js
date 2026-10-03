const multer = require('multer');

// single in-memory file upload, a failed upload becomes a flash and a redirect instead of a server error
exports.receiveUpload = (field, maxBytes, { redirectTo, tooLargeKey, failedKey }) => {
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxBytes } }).single(field);
    return (req, res, next) => {
        upload(req, res, (err) => {
            if (!err) return next();
            req.session.flash = { error: req.t(err.code === 'LIMIT_FILE_SIZE' ? tooLargeKey : failedKey) };
            res.redirect(redirectTo(req));
        });
    };
};
