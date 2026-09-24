'use strict';
// Pure engine contract. Scores are null when unrecorded, zero when recorded as zero.
// This is temporary shared implementation to reconcile with Praweena's work.
const grades = ['A','B+','B','C+','C','D+','D'];
const summarize = ({ components, gradingMode, gradeThresholds }) => {
  if (!Array.isArray(components) || !components.length || !['criterion','norm'].includes(gradingMode)) throw new TypeError('Invalid calculation input.');
  const ids = new Set();
  let weightUnits = 0, currentWeightedScore = 0, gradedWeight = 0;
  for (const item of components) {
    const { id, weightPercent, maximumScore, score } = item;
    if (typeof id !== 'string' || ids.has(id) || !Number.isFinite(weightPercent) || weightPercent <= 0 ||
        Math.abs(weightPercent*100 - Math.round(weightPercent*100)) > 1e-8 ||
        !Number.isFinite(maximumScore) || maximumScore <= 0 ||
        !(score === null || (Number.isFinite(score) && score >= 0 && score <= maximumScore))) throw new TypeError('Invalid component.');
    ids.add(id);
    weightUnits += Math.round(weightPercent*100);
    if (score !== null) { currentWeightedScore += score / maximumScore * weightPercent; gradedWeight += weightPercent; }
  }
  if (weightUnits !== 10000) throw new TypeError('Weights must total 100 percent.');
  if (gradingMode === 'norm' && gradeThresholds !== null) throw new TypeError('Norm mode has no criterion thresholds.');
  if (gradingMode === 'criterion' && (!gradeThresholds || Object.keys(gradeThresholds).length !== 7 ||
      grades.some((grade,i) => !Number.isFinite(gradeThresholds[grade]) || gradeThresholds[grade] < 0 ||
        gradeThresholds[grade] > 100 || (i > 0 && gradeThresholds[grade] >= gradeThresholds[grades[i-1]])))) throw new TypeError('Invalid thresholds.');
  const remainingWeight = Math.max(0, 100 - gradedWeight);
  return { currentWeightedScore, gradedWeight, remainingWeight,
    maximumPossibleScore: currentWeightedScore + remainingWeight,
    projectedGrade: gradingMode === 'criterion' && remainingWeight === 0 ?
      (grades.find(grade => currentWeightedScore >= gradeThresholds[grade]) || 'F') : null };
};
const target = (input, targetPercent) => {
  if (!Number.isFinite(targetPercent) || targetPercent < 0 || targetPercent > 100) throw new TypeError('Invalid target.');
  const summary = summarize(input);
  const alreadyAchieved = summary.currentWeightedScore >= targetPercent;
  const requiredRemainingPercent = alreadyAchieved ? 0 : summary.remainingWeight === 0 ? null :
    (targetPercent - summary.currentWeightedScore) / summary.remainingWeight * 100;
  return { ...summary, targetPercent, alreadyAchieved, requiredRemainingPercent,
    reachable: summary.maximumPossibleScore >= targetPercent };
};
module.exports = { summarize, target };

