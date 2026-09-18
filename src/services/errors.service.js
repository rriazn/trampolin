// Renders the shared 404 page with a resource-specific message
exports.renderNotFound = (res, message) => res.status(404).render('errors/404', { message });

// Renders the shared 403 page
exports.renderForbidden = (res) => res.status(403).render('errors/403');
