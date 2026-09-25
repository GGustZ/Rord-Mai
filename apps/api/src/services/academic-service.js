'use strict';
const { randomInt } = require('node:crypto');
const { fail } = require('../lib/errors');
const { validateCreateSection } = require('../lib/validate-create-section');
const { requireOwnedEnrollment } = require('../repositories/academic-repository');
const { courseSummary, targetCalculation } = require('../adapters/engine');
const grades = ['A','B+','B','C+','C','D+','D'];
const uuid = (value) => {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)) throw fail('VALIDATION_ERROR');
  return value;
};
const object = (value, keys) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key=>!keys.includes(key))) throw fail('VALIDATION_ERROR');
};
const joinCode = () => Array.from({length:6},()=> 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[randomInt(36)]).join('');
const enrollmentDto = (row) => ({id:row.id,sectionId:row.section_id,targetGrade:row.target_grade,repeat:null});
const componentDto = (row) => ({id:row.id,name:row.name,weightPercent:Number(row.weight_percent),maximumScore:Number(row.maximum_score)});
const readSection = async (client, sectionId, studentId, lock = false) => {
  // Internal callers provide only a boolean; SQL query text never includes caller-provided identifiers.
  const sql = lock ?
    'SELECT *, withdrawal_deadline::text AS deadline FROM sections WHERE id=$1 FOR UPDATE' :
    'SELECT *, withdrawal_deadline::text AS deadline FROM sections WHERE id=$1 FOR SHARE';
  const {rows} = await client.query(sql,[sectionId]);
  const row=rows[0];
  if(!row) throw fail('RESOURCE_NOT_FOUND');
  const components=(await client.query('SELECT * FROM components WHERE section_id=$1 ORDER BY position,id',[sectionId])).rows.map(componentDto);
  const thresholds = row.grading_mode === 'criterion' ? {
    A:Number(row.a_min),'B+':Number(row.b_plus_min),B:Number(row.b_min),'C+':Number(row.c_plus_min),
    C:Number(row.c_min),'D+':Number(row.d_plus_min),D:Number(row.d_min),
  } : null;
  return {section:{
    id:row.id,joinCode:row.join_code,courseCode:row.course_code,courseName:row.course_name,
    sectionNumber:row.section_number,academicYear:row.academic_year,semester:row.semester,
    credits:row.credits,gradingMode:row.grading_mode,withdrawalDeadline:row.deadline,
    gradeThresholds:thresholds,components,structureRevision:row.structure_revision,canEdit:row.creator_id===studentId,
  }, creatorId:row.creator_id};
};
const createAcademicService = ({consentService, generateJoinCode=joinCode}) => {
  const guarded = (identity,work) => consentService.withStorageConsent({identity},work);
  const createSection = async ({identity,input}) => {
    const validated=validateCreateSection(input);
    if(!validated.success) throw fail('VALIDATION_ERROR');
    const data=validated.data;
    return guarded(identity,async({client,studentId})=>{
      let sectionId;
      for(let attempt=0;attempt<5;attempt++) {
        const code=generateJoinCode();
        if(!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Invalid generated code.');
        const t=data.gradeThresholds;
        const values=[code,data.courseCode,data.courseName,data.sectionNumber,data.academicYear,data.semester,
          data.credits,data.gradingMode,data.withdrawalDeadline,...grades.map(g=>t?.[g]??null),studentId];
        const {rows}=await client.query(`INSERT INTO sections(join_code,course_code,course_name,section_number,academic_year,semester,credits,grading_mode,withdrawal_deadline,
          a_min,b_plus_min,b_min,c_plus_min,c_min,d_plus_min,d_min,creator_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (join_code) DO NOTHING RETURNING id`,values);
        if(rows[0]) { sectionId=rows[0].id;break; }
      }
      if(!sectionId) throw fail('JOIN_CODE_UNAVAILABLE');
      for(const [position,c] of data.components.entries()) await client.query(
        'INSERT INTO components(section_id,name,weight_percent,maximum_score,position) VALUES ($1,$2,$3,$4,$5)',
        [sectionId,c.name,c.weightPercent,c.maximumScore,position]);
      const row=(await client.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2) RETURNING *',[studentId,sectionId])).rows[0];
      return {section:(await readSection(client,sectionId,studentId)).section,enrollment:enrollmentDto(row)};
    });
  };
  const joinSection = async ({identity,code}) => {
    if(typeof code!=='string'||! /^[A-Z0-9]{6}$/.test(code.trim().toUpperCase())) throw fail('VALIDATION_ERROR');
    return guarded(identity,async({client,studentId})=>{
      const row=(await client.query('SELECT id FROM sections WHERE join_code=$1 FOR SHARE',[code.trim().toUpperCase()])).rows[0];
      if(!row) throw fail('SECTION_NOT_FOUND');
      const inserted=(await client.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2) ON CONFLICT(student_id,section_id) DO NOTHING RETURNING *',[studentId,row.id])).rows[0];
      if(!inserted) throw fail('ALREADY_ENROLLED');
      return enrollmentDto(inserted);
    });
  };
  const getSection = async ({identity,sectionId}) => {
    uuid(sectionId);
    return guarded(identity,async({client,studentId})=>{
      if(!(await client.query('SELECT id FROM enrollments WHERE student_id=$1 AND section_id=$2',[studentId,sectionId])).rows.length) throw fail('RESOURCE_NOT_FOUND');
      return (await readSection(client,sectionId,studentId)).section;
    });
  };
  const reviseWeights = async ({identity,sectionId,input}) => {
    uuid(sectionId);object(input,['expectedRevision','components']);
    if(!Number.isInteger(input.expectedRevision)||input.expectedRevision<1||!Array.isArray(input.components)||!input.components.length||input.components.length>30) throw fail('VALIDATION_ERROR');
    const ids=new Set();let units=0;
    for(const c of input.components) {
      object(c,['id','weightPercent']);uuid(c.id);
      if(ids.has(c.id)||!Number.isFinite(c.weightPercent)||c.weightPercent<=0||c.weightPercent>100||
        Math.abs(c.weightPercent*100-Math.round(c.weightPercent*100))>1e-8) throw fail('VALIDATION_ERROR');
      ids.add(c.id);units+=Math.round(c.weightPercent*100);
    }
    if(units!==10000) throw fail('VALIDATION_ERROR');
    return guarded(identity,async({client,studentId})=>{
      const {section,creatorId}=await readSection(client,sectionId,studentId,true);
      if(creatorId!==studentId) throw fail('CREATOR_REQUIRED');
      if(section.structureRevision!==input.expectedRevision) throw fail('REVISION_CONFLICT');
      if(section.components.length!==ids.size||section.components.some(c=>!ids.has(c.id))) throw fail('VALIDATION_ERROR');
      const previous=section.components.map(c=>({id:c.id,weightPercent:c.weightPercent}));
      for(const c of input.components) await client.query('UPDATE components SET weight_percent=$1 WHERE id=$2 AND section_id=$3',[c.weightPercent,c.id,sectionId]);
      const revision=section.structureRevision+1;
      await client.query('UPDATE sections SET structure_revision=$1,updated_at=CURRENT_TIMESTAMP WHERE id=$2',[revision,sectionId]);
      await client.query('INSERT INTO grading_revisions(section_id,revision,actor_id,previous_weights,new_weights) VALUES ($1,$2,$3,$4,$5)',
        [sectionId,revision,studentId,JSON.stringify(previous),JSON.stringify(input.components)]);
      return (await readSection(client,sectionId,studentId)).section;
    });
  };
  const detailInTransaction = async(client,studentId,enrollmentId)=>{
    const enrollment=await requireOwnedEnrollment(client,studentId,enrollmentId);
    const {section}=await readSection(client,enrollment.section_id,studentId);
    const scores=(await client.query('SELECT component_id,score,updated_at FROM scores WHERE enrollment_id=$1',[enrollmentId])).rows.map(r=>({componentId:r.component_id,score:Number(r.score),updatedAt:r.updated_at}));
    const attendance=(await client.query('SELECT component_id,attended,total_sessions,updated_at FROM attendance WHERE enrollment_id=$1',[enrollmentId])).rows.map(r=>({componentId:r.component_id,attended:r.attended,totalSessions:r.total_sessions,updatedAt:r.updated_at}));
    return {enrollment:enrollmentDto(enrollment),section,scores,attendance};
  };
  const detail = async ({identity,enrollmentId})=>{
    uuid(enrollmentId);
    return guarded(identity,({client,studentId})=>detailInTransaction(client,studentId,enrollmentId));
  };
  const calculationInput = (d)=> ({
    gradingMode:d.section.gradingMode,gradeThresholds:d.section.gradeThresholds,
    components:d.section.components.map(c=>{
      const s=d.scores.find(s=>s.componentId===c.id);
      const a=d.attendance.find(a=>a.componentId===c.id);
      return {...c,score:s ? s.score : a ? a.attended/a.totalSessions*c.maximumScore : null};
    }),
  });
  const summary = async ({identity,enrollmentId,targetGrade})=>{
    uuid(enrollmentId);
    if(targetGrade!==undefined&&!grades.includes(targetGrade)) throw fail('VALIDATION_ERROR');
    return guarded(identity,async({client,studentId})=>{
      const d=await detailInTransaction(client,studentId,enrollmentId);
      if(targetGrade!==undefined&&d.section.gradingMode==='norm') throw fail('NORM_GRADE_UNAVAILABLE');
      const input=calculationInput(d);
      const result=targetGrade===undefined ? courseSummary(input) : targetCalculation(input,targetGrade);
      return {...result,structureRevision:d.section.structureRevision};
    });
  };
  const updateTarget = async ({identity,enrollmentId,input})=>{
    uuid(enrollmentId);object(input,['targetGrade']);
    if(!Object.hasOwn(input,'targetGrade')||(input.targetGrade!==null&&!grades.includes(input.targetGrade))) throw fail('VALIDATION_ERROR');
    return guarded(identity,async({client,studentId})=>{
      const row=await requireOwnedEnrollment(client,studentId,enrollmentId);
      const {section}=await readSection(client,row.section_id,studentId);
      if(input.targetGrade!==null&&section.gradingMode==='norm') throw fail('NORM_GRADE_UNAVAILABLE');
      return enrollmentDto((await client.query('UPDATE enrollments SET target_grade=$1 WHERE id=$2 RETURNING *',[input.targetGrade,enrollmentId])).rows[0]);
    });
  };
  const writeComponent = async ({identity,enrollmentId,componentId,input,kind,remove=false})=>{
    uuid(enrollmentId);uuid(componentId);
    if(!['score','attendance'].includes(kind)) throw new TypeError('Invalid entry kind.');
    if(!remove) {
      object(input,kind==='score'?['score']:['attended','totalSessions']);
      if(kind==='score'&&(!Number.isFinite(input.score)||input.score<0)) throw fail('VALIDATION_ERROR');
      if(kind==='attendance'&&(!Number.isSafeInteger(input.attended)||!Number.isSafeInteger(input.totalSessions)||
        input.attended<0||input.totalSessions<=0||input.attended>input.totalSessions||input.totalSessions>2147483647)) throw fail('VALIDATION_ERROR');
    }
    return guarded(identity,async({client,studentId})=>{
      const row=await requireOwnedEnrollment(client,studentId,enrollmentId);
      const {section}=await readSection(client,row.section_id,studentId);
      const component=section.components.find(c=>c.id===componentId);
      if(!component) throw fail('VALIDATION_ERROR');
      if(remove) {
        await client.query(kind==='score'?
          'DELETE FROM scores WHERE enrollment_id=$1 AND component_id=$2':
          'DELETE FROM attendance WHERE enrollment_id=$1 AND component_id=$2',[enrollmentId,componentId]);
        return;
      }
      if(kind==='score') {
        if(input.score>component.maximumScore) throw fail('VALIDATION_ERROR');
        if((await client.query('SELECT 1 FROM attendance WHERE enrollment_id=$1 AND component_id=$2',[enrollmentId,componentId])).rows.length) throw fail('ATTENDANCE_SOURCE_EXISTS');
        const saved=(await client.query(`INSERT INTO scores(enrollment_id,component_id,section_id,score) VALUES ($1,$2,$3,$4)
          ON CONFLICT(enrollment_id,component_id) DO UPDATE SET score=EXCLUDED.score,updated_at=CURRENT_TIMESTAMP RETURNING updated_at`,
          [enrollmentId,componentId,row.section_id,input.score])).rows[0];
        return {componentId,score:input.score,updatedAt:saved.updated_at};
      }
      if((await client.query('SELECT 1 FROM scores WHERE enrollment_id=$1 AND component_id=$2',[enrollmentId,componentId])).rows.length) throw fail('SCORE_SOURCE_EXISTS');
      const saved=(await client.query(`INSERT INTO attendance(enrollment_id,component_id,section_id,attended,total_sessions) VALUES ($1,$2,$3,$4,$5)
        ON CONFLICT(enrollment_id,component_id) DO UPDATE SET attended=EXCLUDED.attended,total_sessions=EXCLUDED.total_sessions,updated_at=CURRENT_TIMESTAMP RETURNING updated_at`,
        [enrollmentId,componentId,row.section_id,input.attended,input.totalSessions])).rows[0];
      return {componentId,attended:input.attended,totalSessions:input.totalSessions,updatedAt:saved.updated_at};
    });
  };
  return {createSection,joinSection,getSection,reviseWeights,detail,summary,updateTarget,writeComponent};
};
module.exports = {createAcademicService};
