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

// panelSlots: array of { judgeRoleId, judgeRoleKey, judgeRoleName, granularity, isDeduction,
// maxValue, judgeCount, dropHigh, dropLow, combine, multiplier }
exports.computeAttemptScore = (panelSlots, scoresByJudgeRoleId, elementScoresByJudgeRoleId, elementCount) => {
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
      let roleComplete = true;
      let submittedCount = 0;
      const perTrick = [];

      for (let elementNumber = 1; elementNumber <= elementCount; elementNumber++) {
        const values = elementScores.get(elementNumber) || [];
        const elementValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
        combinedTotal += elementValue ?? 0;
        submittedCount += values.length;
        const elementComplete = values.length >= slot.judgeCount;
        if (!elementComplete) roleComplete = false;
        perTrick.push({ elementNumber, value: elementValue, count: values.length, required: slot.judgeCount, isComplete: elementComplete });
      }

      // Landing (is_deduction roles, e.g. execution — full 10-skill routines only): per CoP
      // §17.2.3.2, "the sum of the median deductions [considering landing deductions]" — the
      // landing penalty is judged by the same panel as an 11th element, using the same
      // drop/combine rule as tricks 1-10, and required for completeness just like any other trick.
      if (slot.isDeduction && elementCount === 10) {
        const values = elementScores.get(11) || [];
        const landingValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
        combinedTotal += landingValue ?? 0;
        submittedCount += values.length;
        const landingComplete = values.length >= slot.judgeCount;
        if (!landingComplete) roleComplete = false;
        perTrick.push({ elementNumber: 11, value: landingValue, count: values.length, required: slot.judgeCount, isComplete: landingComplete, isLanding: true });
      }

      // Bonus (non-deduction element roles, e.g. difficulty): an optional extra addition on top
      // of the per-trick sum. Always available regardless of elementCount, defaults to 0, and
      // never required/blocking (unlike landing) — "usually 0" per the product owner.
      if (!slot.isDeduction) {
        const values = elementScores.get(11) || [];
        if (values.length > 0) {
          const bonusValue = exports.combineScores({ scores: values, dropHigh, dropLow, combine, multiplier: 1 });
          combinedTotal += bonusValue ?? 0;
          perTrick.push({ elementNumber: 11, value: bonusValue, count: values.length, required: slot.judgeCount, isComplete: true, isBonus: true });
        }
      }

      const roleValue = submittedCount === 0 ? 0 : (slot.isDeduction ? elementCount - combinedTotal : combinedTotal);
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
