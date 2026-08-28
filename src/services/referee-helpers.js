
exports.isWithinRange = (value, assignment) => {
  if (value < assignment.score_min) return false;
  if (assignment.score_max !== null && value > assignment.score_max) return false;
  return true;
};

exports.rangeErrorMessage = (assignment) => {
  return assignment.score_max !== null
    ? `Score must be between ${assignment.score_min} and ${assignment.score_max}.`
    : `Score must be at least ${assignment.score_min}.`;
};