const assert = require('node:assert/strict');
const { summarize, target } = require('../src');
const input = (score=80,weight=40) => ({gradingMode:'norm',gradeThresholds:null,components:[
  {id:'mid',weightPercent:weight,maximumScore:100,score},
  {id:'final',weightPercent:100-weight,maximumScore:100,score:null},
]});
test('current score uses weighted points; missing differs from zero',()=>{
  assert.equal(summarize(input()).currentWeightedScore,32);
  assert.equal(summarize(input(0)).gradedWeight,40);
  assert.equal(summarize(input(null)).gradedWeight,0);
});
test('weight revision recalculates without altering inputs',()=>{
  const data=input(80,30); assert.equal(summarize(data).currentWeightedScore,24);
  assert.equal(data.components[0].score,80);
  assert.equal(target(data,80).requiredRemainingPercent,80);
});
test('unreachable percentage above 100 remains visible',()=>{
  const result=target(input(0,60),80);
  assert.equal(result.requiredRemainingPercent,200); assert.equal(result.reachable,false);
});
test('achieved target needs zero more; no remaining avoids division by zero',()=>{
  assert.equal(target(input(),30).requiredRemainingPercent,0);
  const data=input(0);data.components[1].score=0;
  assert.equal(target(data,80).requiredRemainingPercent,null);
});
test('criterion exact boundaries and norm grade behaviour',()=>{
  const data=input(80);data.components[1].score=80;
  assert.equal(summarize(data).projectedGrade,null);
  data.gradingMode='criterion';data.gradeThresholds={A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50};
  assert.equal(summarize(data).projectedGrade,'A');
});
test('decimal weights and invalid totals',()=>{
  const data={gradingMode:'norm',gradeThresholds:null,components:[33.33,33.33,33.34].map((weightPercent,i)=>({id:String(i),weightPercent,maximumScore:100,score:100}))};
  assert.equal(summarize(data).currentWeightedScore,100);
  data.components[0].weightPercent=30;assert.throws(()=>summarize(data));
});
test('numeric strings, nonfinite scores and duplicate components fail',()=>{
  assert.throws(()=>summarize(input('80')));assert.throws(()=>summarize(input(Infinity)));
  const data=input();data.components[1].id='mid';assert.throws(()=>summarize(data));
});
