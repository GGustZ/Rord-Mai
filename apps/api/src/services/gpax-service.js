'use strict';
const { fail } = require('../lib/errors');
const { object, uuid } = require('./academic-service');
const { gpax, GRADE_POINTS } = require('../../../../packages/engine/src/gpax');
const profileDto = r => ({ currentGpa:Number(r.current_gpa),creditsCounted:r.credits_counted,
  academicYear:r.academic_year,semester:r.semester });
const createGpaxService = ({ consentService }) => {
  const getProfile = ({ identity }) => consentService.withStorageConsent({identity},async({client,studentId})=>{
    const row=(await client.query('SELECT * FROM academic_profiles WHERE student_id=$1',[studentId])).rows[0];
    if(!row) throw fail('RESOURCE_NOT_FOUND');
    return profileDto(row);
  });
  const saveProfile = ({ identity,input }) => {
    object(input,['currentGpa','creditsCounted','academicYear','semester']);
    if(!Number.isFinite(input.currentGpa)||input.currentGpa<0||input.currentGpa>4||
      !Number.isInteger(input.creditsCounted)||input.creditsCounted<0||input.creditsCounted>2147483647||
      (input.creditsCounted===0&&input.currentGpa!==0)||!Number.isInteger(input.academicYear)||
      input.academicYear<1||input.academicYear>9999||![1,2,3].includes(input.semester))throw fail('VALIDATION_ERROR');
    return consentService.withStorageConsent({identity},async({client,studentId})=>profileDto((await client.query(
      `INSERT INTO academic_profiles(student_id,current_gpa,credits_counted,academic_year,semester) VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(student_id) DO UPDATE SET current_gpa=EXCLUDED.current_gpa,credits_counted=EXCLUDED.credits_counted,
       academic_year=EXCLUDED.academic_year,semester=EXCLUDED.semester RETURNING *`,
      [studentId,input.currentGpa,input.creditsCounted,input.academicYear,input.semester])).rows[0]));
  };
  const calculateInTransaction = async ({ client,studentId },input) => {
    object(input,['scenarios']);
    if(!Array.isArray(input.scenarios)||!input.scenarios.length||input.scenarios.length>20)throw fail('VALIDATION_ERROR');
    const labels=new Set();
    for(const scenario of input.scenarios){
      object(scenario,['label','outcomes']);
      if(typeof scenario.label!=='string'||!scenario.label.trim()||scenario.label.length>80||labels.has(scenario.label)||!Array.isArray(scenario.outcomes))throw fail('VALIDATION_ERROR');
      labels.add(scenario.label);
      const ids=new Set();
      for(const outcome of scenario.outcomes){
        object(outcome,outcome?.outcome==='grade'?['enrollmentId','outcome','grade']:['enrollmentId','outcome']);
        uuid(outcome.enrollmentId);
        if(ids.has(outcome.enrollmentId)||!['grade','withdraw'].includes(outcome.outcome)||
          (outcome.outcome==='grade'&&(typeof outcome.grade!=='string'||!Object.hasOwn(GRADE_POINTS,outcome.grade))))throw fail('VALIDATION_ERROR');
        ids.add(outcome.enrollmentId);
      }
    }
    const profile=(await client.query('SELECT * FROM academic_profiles WHERE student_id=$1',[studentId])).rows[0];
    if(!profile)throw fail('PROFILE_REQUIRED');
    const enrollments=(await client.query(`SELECT e.id,e.previous_grade_point,s.credits FROM enrollments e
      JOIN sections s ON s.id=e.section_id WHERE e.student_id=$1 ORDER BY s.id FOR SHARE OF s`,[studentId])).rows;
    const byId=new Map(enrollments.map(r=>[r.id,r]));
    return {results:input.scenarios.map(scenario=>{
      if(scenario.outcomes.length!==enrollments.length||scenario.outcomes.some(o=>!byId.has(o.enrollmentId)))throw fail('VALIDATION_ERROR');
      if(enrollments.some(r=>r.previous_grade_point!==null))throw fail('REPEAT_RULE_UNVERIFIED');
      return {label:scenario.label,...gpax({...profileDto(profile),courses:scenario.outcomes.map(o=>({...o,credits:byId.get(o.enrollmentId).credits}))})};
    })};
  };
  const calculate = ({identity,input}) => consentService.withStorageConsent({identity},ctx=>calculateInTransaction(ctx,input));
  return {getProfile,saveProfile,calculate,calculateInTransaction};
};
module.exports={createGpaxService};
