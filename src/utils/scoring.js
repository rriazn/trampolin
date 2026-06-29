exports.trimmedMean = (scores) => {
  if (scores.length === 0) return null;
  if (scores.length < 3) return scores.reduce((a, b) => a + b, 0) / scores.length;
  const sorted = [...scores].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
}