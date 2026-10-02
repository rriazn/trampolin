
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

// the FIG scores the synchronisation device mark in hundredths (17.2.1), other attempt roles in tenths
const SCORE_STEP_BY_ROLE = { synchronisation: 0.01 };

exports.scoreStep = (roleKey) => SCORE_STEP_BY_ROLE[roleKey] ?? 0.1;

exports.scoreDecimals = (roleKey) => (exports.scoreStep(roleKey) < 0.1 ? 2 : 1);

// the H and S marks start at the number of valid elements, up to 10 (FIG 17.2.4.2, 17.2.6.2 and 19.7)
const CAPPED_BY_VALID_ELEMENTS = ['horizontal_displacement', 'synchronisation'];

exports.maxScoreFor = (roleKey, scoreMax, elementCount) => {
  if (!CAPPED_BY_VALID_ELEMENTS.includes(roleKey)) return scoreMax;
  return scoreMax === null ? elementCount : Math.min(scoreMax, elementCount);
};

