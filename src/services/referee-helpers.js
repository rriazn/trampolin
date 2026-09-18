
exports.isWithinRange = (value, assignment) => {
  if (value < assignment.score_min) return false;
  if (assignment.score_max !== null && value > assignment.score_max) return false;
  return true;
};

exports.rangeErrorMessage = (assignment, t) => {
  return assignment.score_max !== null
    ? t('referee:rangeError.max', { min: assignment.score_min, max: assignment.score_max })
    : t('referee:rangeError.min', { min: assignment.score_min });
};