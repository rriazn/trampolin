// Renders the shared 404 page with a resource-specific message
exports.renderNotFound = (res, message) => res.status(404).render('errors/404', { message });
