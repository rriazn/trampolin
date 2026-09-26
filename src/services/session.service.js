const DEFAULT_MINUTES = 60;

exports.getSessionIdleTimeoutMs = (env = process.env) => {
    const minutes = Number(env.SESSION_IDLE_TIMEOUT_MINUTES);
    const validMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : DEFAULT_MINUTES;
    return validMinutes * 60 * 1000;
};
