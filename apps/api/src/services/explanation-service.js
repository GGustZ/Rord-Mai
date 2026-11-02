'use strict';
const { createAcademicService,calculationInput,object,uuid }=require('./academic-service');
const { courseSummary,targetCalculation }=require('../adapters/engine');
const { gpaxComparison,DISCLAIMER }=require('../../../../packages/engine/src/gpax');
const { fail }=require('../lib/errors');
const number=value=>value===null?'ไม่มีค่าที่คำนวณได้':value.toLocaleString('th-TH',{maximumFractionDigits:2});
const payloadFor = (kind,result) => {
  // Explicit field selection, never send domain objects or user-supplied scenario labels.
  const metrics=kind==='withdrawal'?{stay:result.stay,withdraw:result.withdraw,delta:result.delta}:
    kind==='target'?{current:result.currentWeightedScore,remaining:result.remainingWeightPercent,required:result.requiredRemainingPercent,threshold:result.targetThreshold}:
    {current:result.currentWeightedScore,graded:result.gradedWeightPercent,remaining:result.remainingWeightPercent,maximum:result.maximumPossibleScore};
  return {kind,metrics,reasonCode:result.reasonCode??null,reachable:result.reachable??null};
};
const templateFor = payload => {
  const m=Object.fromEntries(Object.entries(payload.metrics).map(([k,v])=>[k,number(v)]));
  if(payload.kind==='withdrawal')return `สมมติฐานการเรียนต่อให้ GPAX ${m.stay} การถอนให้ GPAX ${m.withdraw} ส่วนต่าง (ถอนลบเรียนต่อ) ${m.delta}\n${DISCLAIMER}`;
  if(payload.kind==='target')return `คะแนนถ่วงน้ำหนักปัจจุบัน ${m.current} จุด เป้าหมาย ${m.threshold} จุด เหลือน้ำหนัก ${m.remaining}% ต้องได้เฉลี่ย ${m.required}% ในส่วนที่เหลือ ${payload.reachable?'เป้าหมายยังเป็นไปได้':'เป้าหมายไม่สามารถทำได้ตามข้อมูลปัจจุบัน'}\nเป็นการคำนวณจากข้อมูลที่คุณบันทึก ไม่ใช่การรับประกันเกรด`;
  return `คะแนนถ่วงน้ำหนักปัจจุบัน ${m.current} จุด ประเมินแล้ว ${m.graded}% เหลือ ${m.remaining}% คะแนนสูงสุดที่ยังเป็นไปได้ ${m.maximum} จุด\n${payload.reasonCode==='NORM_REFERENCED'?'รายวิชาอิงกลุ่มจึงไม่ทำนายเกรดตัวอักษร':'ไม่ทำนายเกรดจากคะแนนที่ยังไม่ได้บันทึก'} เป็นการประมาณการจากข้อมูลที่คุณระบุ`;
};
const renderGenerated = (text,payload) => {
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw new Error('Invalid explanation.');
  const seen=new Set();
  const rest=text.replace(/\{\{([A-Za-z]+)\}\}/g,(_match,key)=>{
    if(!Object.hasOwn(payload.metrics,key))throw new Error('Unknown metric.');
    seen.add(key);return '';
  });
  if(/[{}]/.test(rest)||/\p{N}/u.test(rest)||seen.size!==Object.keys(payload.metrics).length)throw new Error('Unverified numbers or missing metrics.');
  // Model output remains plain text; trusted numbers are filled only after verification.
  return text.replace(/\{\{([A-Za-z]+)\}\}/g,(_match,key)=>number(payload.metrics[key]));
};
const createExplanationService=({consentService,gpaxService,generateText=null})=>({
  explain:({identity,enrollmentId,input})=>{
    uuid(enrollmentId);object(input,input?.kind==='withdrawal'?['kind','scenarios']:['kind']);
    if(!['summary','target','withdrawal'].includes(input.kind))throw fail('VALIDATION_ERROR');
    return consentService.withStorageConsent({identity},async ctx=>{
      const academic=createAcademicService({consentService:{withStorageConsent:async(_args,work)=>work(ctx)}});
      const detail=await academic.detail({enrollmentId});
      let result;
      if(input.kind==='withdrawal'){
        if(!Array.isArray(input.scenarios)||input.scenarios.length!==2)throw fail('VALIDATION_ERROR');
        const calculated=await gpaxService.calculateInTransaction(ctx,{scenarios:input.scenarios});
        const [stay,withdraw]=input.scenarios.map(s=>new Map(s.outcomes.map(o=>[o.enrollmentId,o])));
        if(stay.get(enrollmentId)?.outcome!=='grade'||withdraw.get(enrollmentId)?.outcome!=='withdraw'||
          [...stay].some(([id,o])=>id!==enrollmentId&&(o.outcome!==withdraw.get(id)?.outcome||o.grade!==withdraw.get(id)?.grade)))throw fail('VALIDATION_ERROR');
        result=gpaxComparison(calculated.results);
      }else if(input.kind==='target'){
        if(!detail.enrollment.targetGrade)throw fail('TARGET_REQUIRED');
        if(detail.section.gradingMode!=='criterion')throw fail('NORM_GRADE_UNAVAILABLE');
        result=targetCalculation(calculationInput(detail),detail.enrollment.targetGrade);
      }else result=courseSummary(calculationInput(detail));
      const payload=payloadFor(input.kind,result),fallback={text:templateFor(payload),source:'template'};
      if(!ctx.crossBorderExplanation||!generateText)return fallback;
      try{
        const text=renderGenerated(await generateText(payload),payload);
        return {text:text+'\n'+(input.kind==='withdrawal'?DISCLAIMER:'เป็นการประมาณการจากข้อมูลที่คุณระบุ ไม่ใช่การรับประกันผล'),source:'llm'};
      }catch{return fallback;}
    });
  },
});
module.exports={createExplanationService,payloadFor,templateFor,renderGenerated};
