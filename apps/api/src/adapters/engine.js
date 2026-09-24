'use strict';
const { summarize, target } = require('../../../../packages/engine/src');
const courseSummary = (input) => {
  const result = summarize(input);
  return { currentWeightedScore: result.currentWeightedScore,
    gradedWeightPercent: result.gradedWeight, remainingWeightPercent: result.remainingWeight,
    maximumPossibleScore: result.maximumPossibleScore, gradingMode: input.gradingMode,
    projectedGrade: result.projectedGrade, projectionAssumption: null,
    reasonCode: input.gradingMode === 'norm' ? 'NORM_REFERENCED' :
      result.remainingWeight > 0 ? 'INCOMPLETE_ASSESSMENTS' : null };
};
const targetCalculation = (input, targetGrade) => {
  if (input.gradingMode !== 'criterion') throw new TypeError('Norm sections have no grade target threshold.');
  const result = target(input, input.gradeThresholds?.[targetGrade]);
  return { targetGrade, targetThreshold: result.targetPercent,
    currentWeightedScore: result.currentWeightedScore, remainingWeightPercent: result.remainingWeight,
    requiredRemainingPercent: result.requiredRemainingPercent, reachable: result.reachable,
    reasonCode: result.alreadyAchieved ? 'ALREADY_ACHIEVED' : result.remainingWeight === 0 ?
      'NO_REMAINING_WEIGHT' : result.reachable ? 'REACHABLE' : 'EXCEEDS_MAXIMUM' };
};
module.exports = { courseSummary, targetCalculation };
