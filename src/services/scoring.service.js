const { isWithinRange, rangeErrorMessage } = require("./helpers/referee.helpers");

// combine scores and drop high/low values
exports.combineScores = ({ scores, dropHigh = 0, dropLow = 0, combine = 'sum', multiplier = 1 }) => {
  if (!scores || scores.length === 0) return null;

  const sorted = [...scores].sort((a, b) => a - b);
  const kept = sorted.length <= dropHigh + dropLow
    ? sorted
    : sorted.slice(dropLow, sorted.length - dropHigh);

  let combined;
  if (combine === 'sum') {
    combined = kept.reduce((a, b) => a + b, 0);
  } else if (combine === 'mean') {
    combined = kept.reduce((a, b) => a + b, 0) / kept.length;
  } else if (combine === 'median') {
    const mid = Math.floor(kept.length / 2);
    combined = kept.length % 2 === 0 ? (kept[mid - 1] + kept[mid]) / 2 : kept[mid];
  } else {
    throw new Error(`Unknown combine mode: ${combine}`);
  }

  return combined * multiplier;
};

// panelSlots: array of { judgeRoleId, judgeRoleKey, judgeRoleName, granularity, isDeduction, hasLanding, maxValue, judgeCount, dropHigh, dropLow, combine, multiplier, aggregation }
exports.computeAttemptScore = (panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementCount, elementScoresByAssignment = new Map()) => {
  let total = 0;
  let isComplete = true;
  const breakdown = [];

  for (const slot of panelSlots) {
    const dropHigh = slot.dropHigh || 0;
    const dropLow = slot.dropLow || 0;
    const combine = slot.combine || 'sum';

    if (slot.granularity === 'element') {
      const elementScores = elementScoresByJudgeRoleId.get(slot.judgeRoleId) || new Map();
      let combinedTotal = 0;
      let perTrickComplete = true;
      let submittedCount = 0;
      const perTrick = [];

      for (let elementNumber = 1; elementNumber <= elementCount; elementNumber++) {
        const values = elementScores.get(elementNumber) || [];
        const elementValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
        combinedTotal += elementValue ?? 0;
        submittedCount += values.length;
        const elementComplete = values.length >= slot.judgeCount;
        if (!elementComplete) perTrickComplete = false;
        perTrick.push({ elementNumber, value: elementValue, count: values.length, required: slot.judgeCount, isComplete: elementComplete });
      }

      // Landing deduction
      const hasLandingLine = Boolean(slot.hasLanding) && elementCount === 10;
      const hasExtra = hasLandingLine || (!slot.isDeduction && elementCount > 0);
      if (hasLandingLine) {
        const values = elementScores.get(11) || [];
        const landingValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
        combinedTotal += landingValue ?? 0;
        submittedCount += values.length;
        const landingComplete = values.length >= slot.judgeCount;
        if (!landingComplete) perTrickComplete = false;
        perTrick.push({ elementNumber: 11, value: landingValue, count: values.length, required: slot.judgeCount, isComplete: landingComplete, isLanding: true });
      }

      // Bonus, e.g. triple bonus
      if (!slot.isDeduction && elementCount > 0) {
        const values = elementScores.get(11) || [];
        if (values.length > 0) {
          const bonusValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
          combinedTotal += bonusValue ?? 0;
          perTrick.push({ elementNumber: 11, value: bonusValue, count: values.length, required: slot.judgeCount, isComplete: true, isBonus: true });
        }
      }

      // Missing compulsory skill deduction (FIG Code of Points 6.1.2): fixed 2.0-point penalty
      if (!slot.isDeduction && elementCount > 0) {
        const values = elementScores.get(12) || [];
        if (values.length > 0) {
          const missingSkillValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
          combinedTotal -= missingSkillValue ?? 0;
          perTrick.push({ elementNumber: 12, value: missingSkillValue, count: values.length, required: slot.judgeCount, isComplete: true, isMissingSkill: true });
        }
      }

      // each assignment's own personal, uncombined value, used by per_judge aggregation below and exposed for the head judge's checklist
      const byAssignment = (elementScoresByAssignment.get(slot.judgeRoleId)) || new Map();
      const requiredCount = elementCount + (hasLandingLine ? 1 : 0);
      const perJudge = [...byAssignment.entries()].map(([assignmentId, elementsMap]) => {
        let personalTricksTotal = 0;
        let tricksSubmitted = 0;
        for (let n = 1; n <= elementCount; n++) {
          if (elementsMap.has(n)) { personalTricksTotal += elementsMap.get(n); tricksSubmitted++; }
        }
        const extraValue = (hasExtra && elementsMap.has(11)) ? elementsMap.get(11) : undefined;
        const missingSkillValue = (!slot.isDeduction && elementsMap.has(12)) ? elementsMap.get(12) : undefined;
        const submitted = tricksSubmitted + (extraValue !== undefined ? 1 : 0) + (missingSkillValue !== undefined ? 1 : 0);
        let value = null;
        if (tricksSubmitted > 0) {
          const personalTotal = personalTricksTotal + (extraValue ?? 0) - (missingSkillValue ?? 0);
          value = slot.isDeduction ? elementCount - personalTotal : personalTotal;
        }
        return { assignmentId, value, submittedCount: submitted, isComplete: submitted >= requiredCount };
      });

      let roleValue, roleComplete;
      if (slot.aggregation === 'per_judge') {
        // those per-judge personal totals are dropped/combined the same way as any other list
        const perJudgeScores = perJudge.filter(pj => pj.value !== null).map(pj => pj.value);
        const fullyDoneCount = perJudge.filter(pj => pj.isComplete).length;
        roleValue = exports.combineScores({ scores: perJudgeScores, dropHigh, dropLow, combine, multiplier: 1 }) ?? 0;
        roleComplete = fullyDoneCount >= slot.judgeCount;
      } else {
        const countedJudges = combine === 'sum' && slot.judgeCount > dropHigh + dropLow ? slot.judgeCount - dropHigh - dropLow : 1;
        roleValue = submittedCount === 0 ? 0 : (slot.isDeduction ? countedJudges * elementCount - combinedTotal : combinedTotal);
        roleComplete = perTrickComplete;
      }

      const contribution = roleValue * slot.multiplier;
      total += contribution;
      if (!roleComplete) isComplete = false;

      breakdown.push({
        judgeRoleKey: slot.judgeRoleKey,
        name: slot.judgeRoleName,
        value: contribution,
        required: slot.judgeCount,
        isComplete: roleComplete,
        perTrick,
        perJudge,
      });
    } else if (elementCount === 0 && slot.judgeRoleKey !== 'head_judge') {
      // No skills were performed
      breakdown.push({
        judgeRoleKey: slot.judgeRoleKey,
        name: slot.judgeRoleName,
        value: 0,
        count: 0,
        required: slot.judgeCount,
        isComplete: true,
        isNotApplicable: true,
      });
    } else {
      const scores = scoresByJudgeRoleId.get(slot.judgeRoleId) || [];
      const combined = exports.combineScores({ scores, dropHigh, dropLow, combine, multiplier: slot.multiplier });
      const contribution = combined ?? 0;
      const roleComplete = scores.length >= slot.judgeCount;
      total += contribution;
      if (!roleComplete) isComplete = false;

      breakdown.push({
        judgeRoleKey: slot.judgeRoleKey,
        name: slot.judgeRoleName,
        value: contribution,
        count: scores.length,
        required: slot.judgeCount,
        isComplete: roleComplete,
      });
    }
  }

  return { total, breakdown, isComplete };
};

exports.parseAndValidateScore = (score, assignment) => {
    const parsed = parseFloat(score);
    const inRange = !isNaN(parsed) && parsed >= assignment.score_min && (assignment.score_max === null || parsed <= assignment.score_max);
    return { parsed, inRange };
};

exports.parseAndValidateElementScores = (assignment, elementCount, elements, t) => {
    // Non-deduction element roles (difficulty) are entered x10 for easier typing
    const scale = assignment.isDeduction ? 1 : 10;
    const parsedValues = [];
    for (let n = 1; n <= elementCount; n++) {
        const raw = parseFloat(elements[`element_${n}`]);
        const parsed = isNaN(raw) ? NaN : raw / scale;
        if (isNaN(parsed) || !isWithinRange(parsed, assignment)) {
            throw new RangeError(t('referee:errors.trickRange', { number: n, rangeError: rangeErrorMessage(assignment, t) }));
        }
        parsedValues.push([n, parsed]);
    }
    return parsedValues;
};

exports.parseMissingSkillDeduction = (assignment, elementCount, element_12, t) => {
    if (assignment.isDeduction || elementCount === 0 || element_12 === undefined || element_12 === '') return null;
    const raw = parseFloat(element_12);
    if (raw !== 0 && raw !== 2) {
        throw new RangeError(t('referee:errors.missingSkillRange'));
    }
    return [12, raw];
};

exports.parseAndValidate11thScore = (assignment, elementCount, element_11, t) => {
    if (assignment.hasLanding && elementCount === 10) {
        const raw = parseFloat(element_11);
        if (isNaN(raw) || raw < 0 || raw > 1.0) {
            throw new RangeError(t('referee:errors.landingRange'));
        }
        return [11, raw];
    } else if (!assignment.isDeduction && elementCount > 0 && element_11 !== undefined && element_11 !== '') {
        const raw = parseFloat(element_11);
        const parsed = isNaN(raw) ? NaN : raw / 10;
        if (isNaN(parsed) || !isWithinRange(parsed, assignment)) {
            throw new RangeError(t('referee:errors.bonusRange', { rangeError: rangeErrorMessage(assignment, t) }));
        }
        return [11, parsed];
    }
    return null;
};
