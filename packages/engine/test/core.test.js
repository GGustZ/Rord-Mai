const assert = require('node:assert/strict');
const { summarize, target } = require('../src');
const { gpax, gpaxComparison } = require('../src/gpax');
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
test('zero-weight components are rejected even when total is 100',()=>{
  assert.throws(()=>summarize(input(80,0)));
});
test('repeat-course calculations stay blocked until an official rule is verified',()=>{
  assert.throws(()=>gpax({currentGpa:3,creditsCounted:30,courses:[{credits:3,outcome:'grade',grade:'A',repeat:{previousGradePoint:0}}]}),{code:'REPEAT_RULE_UNVERIFIED'});
});
test('paired GPAX delta is withdrawal minus staying and handles no denominator',()=>{
  assert.deepEqual(gpaxComparison([{gpax:3.25},{gpax:3}]),{stay:3.25,withdraw:3,delta:-0.25});
  assert.equal(gpaxComparison([{gpax:3},{gpax:null}]).delta,null);
});
