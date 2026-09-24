const { courseSummary, targetCalculation } = require('../src/adapters/engine');
const data = { gradingMode: 'criterion', gradeThresholds: { A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50 },
  components: [{ id:'mid',weightPercent:30,maximumScore:100,score:80 }, { id:'final',weightPercent:70,maximumScore:100,score:null }] };
test('adapter uses the published summary and target field names', () => {
  expect(courseSummary(data)).toMatchObject({ currentWeightedScore:24, gradedWeightPercent:30, remainingWeightPercent:70, projectedGrade:null });
  expect(targetCalculation(data,'A')).toMatchObject({ targetThreshold:80, requiredRemainingPercent:80, reasonCode:'REACHABLE' });
});
test('norm refuses letter grade target and identifies its summary reason', () => {
  const norm = { ...data, gradingMode:'norm',gradeThresholds:null };
  expect(courseSummary(norm)).toMatchObject({ projectedGrade:null,reasonCode:'NORM_REFERENCED' });
  expect(() => targetCalculation(norm,'A')).toThrow();
});
