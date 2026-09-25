const {Pool}=require('pg');
const request=require('supertest');
const {migrate}=require('../../src/db/migrate');
const {createConsentService}=require('../../src/services/consent-service');
const {createAcademicService}=require('../../src/services/academic-service');
const {createApp}=require('../../src/app');
const url=process.env.TEST_DATABASE_URL;
if(!url||!/\/rordmai_test(?:\?|$)/.test(url))throw Error('Use disposable rordmai_test.');
const pool=new Pool({connectionString:url,max:8,statement_timeout:8000});
const consent=createConsentService({pool,currentPolicyVersion:'v1'});
const service=createAcademicService({consentService:consent});
const a={lineUserId:'academic-a'},b={lineUserId:'academic-b'},outsider={lineUserId:'outsider'};
const input=()=>({courseCode:'TEST',courseName:'Fictional mathematics',sectionNumber:'1',academicYear:2026,semester:1,credits:3,
  gradingMode:'criterion',withdrawalDeadline:'2026-10-15',gradeThresholds:{A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50},
  components:[{name:'Midterm',weightPercent:40,maximumScore:100},{name:'Final',weightPercent:60,maximumScore:100}]});
const grant=identity=>consent.grantStorageConsent({identity,accepted:true,policyVersion:'v1'});
let created,joined;
beforeAll(async()=>{await migrate(pool);});
afterAll(async()=>{await pool.end();});
beforeEach(async()=>{
  await pool.query('TRUNCATE students,sections CASCADE');
  await Promise.all([grant(a),grant(b),grant(outsider)]);
  created=await service.createSection({identity:a,input:input()});
  joined=await service.joinSection({identity:b,code:' '+created.section.joinCode.toLowerCase()+' '});
});
const write=(identity,enrollmentId,score,componentId=created.section.components[0].id)=>service.writeComponent({identity,enrollmentId,componentId,kind:'score',input:{score}});
const revisions=(expectedRevision=1)=>({expectedRevision,components:created.section.components.map((c,i)=>({id:c.id,weightPercent:i===0?30:70}))});
test('creation inserts ordered components and creator enrolment; shared rules vary independently',async()=>{
  expect(created.section.canEdit).toBe(true);expect(created.section.components.map(c=>c.name)).toEqual(['Midterm','Final']);
  expect((await service.getSection({identity:b,sectionId:created.section.id})).canEdit).toBe(false);
  const second=await service.createSection({identity:a,input:{...input(),gradingMode:'norm',gradeThresholds:null,components:[{name:'Work',weightPercent:100,maximumScore:50}]}});
  expect(second.section.gradingMode).toBe('norm');
  expect((await service.getSection({identity:a,sectionId:created.section.id})).gradingMode).toBe('criterion');
});
test('duplicate join and unknown code have explicit errors',async()=>{
  await expect(service.joinSection({identity:b,code:created.section.joinCode})).rejects.toMatchObject({code:'ALREADY_ENROLLED'});
  await expect(service.joinSection({identity:b,code:'ZZZZZZ'})).rejects.toMatchObject({code:'SECTION_NOT_FOUND'});
});
test('bounded code collisions retry then fail without partial records',async()=>{
  const code=created.section.joinCode;
  const codes=[code,'NEW123'];
  const retry=createAcademicService({consentService:consent,generateJoinCode:()=>codes.shift()});
  expect((await retry.createSection({identity:a,input:input()})).section.joinCode).toBe('NEW123');
  const exhausted=createAcademicService({consentService:consent,generateJoinCode:()=>code});
  await expect(exhausted.createSection({identity:a,input:input()})).rejects.toMatchObject({code:'JOIN_CODE_UNAVAILABLE'});
  expect((await pool.query('SELECT count(*) FROM sections')).rows[0].count).toBe('2');
});
test('component insert failure rolls back whole section and creator enrolment',async()=>{
  await pool.query("CREATE FUNCTION test_reject_component() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deliberate'; END $$");
  await pool.query('CREATE TRIGGER test_component_guard BEFORE INSERT ON components FOR EACH ROW EXECUTE FUNCTION test_reject_component()');
  try {
    await expect(service.createSection({identity:a,input:input()})).rejects.toBeDefined();
    expect((await pool.query('SELECT count(*) FROM sections')).rows[0].count).toBe('1');
    expect((await pool.query('SELECT count(*) FROM enrollments')).rows[0].count).toBe('2');
  } finally {await pool.query('DROP TRIGGER test_component_guard ON components');await pool.query('DROP FUNCTION test_reject_component()');}
});
test('outsiders cannot read sections or other students private records',async()=>{
  await expect(service.getSection({identity:outsider,sectionId:created.section.id})).rejects.toMatchObject({status:404});
  await expect(service.detail({identity:b,enrollmentId:created.enrollment.id})).rejects.toMatchObject({status:404});
  await expect(write(b,created.enrollment.id,50)).rejects.toMatchObject({status:404});
});
test('creator revises shared weights preserving both raw scores and recalculating each account',async()=>{
  await write(a,created.enrollment.id,80);await write(b,joined.id,60);
  const before=(await pool.query('SELECT * FROM scores ORDER BY id')).rows;
  const revised=await service.reviseWeights({identity:a,sectionId:created.section.id,input:revisions()});
  expect(revised.structureRevision).toBe(2);
  expect((await pool.query('SELECT * FROM scores ORDER BY id')).rows).toEqual(before);
  expect((await service.summary({identity:a,enrollmentId:created.enrollment.id})).currentWeightedScore).toBe(24);
  expect((await service.summary({identity:b,enrollmentId:joined.id})).currentWeightedScore).toBe(18);
  expect((await service.summary({identity:a,enrollmentId:created.enrollment.id,targetGrade:'A'})).requiredRemainingPercent).toBe(80);
  expect((await pool.query('SELECT previous_weights,new_weights FROM grading_revisions')).rows[0].previous_weights[0].weightPercent).toBe(40);
});
test('noncreator and legacy ownerless section cannot revise weights',async()=>{
  await expect(service.reviseWeights({identity:b,sectionId:created.section.id,input:revisions()})).rejects.toMatchObject({status:403});
  await pool.query('UPDATE sections SET creator_id=NULL WHERE id=$1',[created.section.id]);
  await expect(service.reviseWeights({identity:a,sectionId:created.section.id,input:revisions()})).rejects.toMatchObject({status:403});
});
test.each([
  x=>{x.components[0].weightPercent=20;},
  x=>{x.components.pop();},
  x=>{x.components[1].id=x.components[0].id;},
  x=>{x.components[0].id='00000000-0000-0000-0000-000000000000';},
  x=>{x.components[0].weightPercent=30.001;x.components[1].weightPercent=69.999;},
  x=>{x.components[0].maximumScore=200;},
])('invalid revision fails without partial changes (%#)',async mutate=>{
  const data=revisions();mutate(data);
  await expect(service.reviseWeights({identity:a,sectionId:created.section.id,input:data})).rejects.toMatchObject({status:400});
  expect((await service.getSection({identity:b,sectionId:created.section.id})).structureRevision).toBe(1);
});
test('concurrent edits with same revision allow one and reject the stale request',async()=>{
  const results=await Promise.allSettled([1,2].map(()=>service.reviseWeights({identity:a,sectionId:created.section.id,input:revisions()})));
  expect(results.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(results.find(x=>x.status==='rejected').reason.code).toBe('REVISION_CONFLICT');
});
test('summary racing with revision sees a complete old or new revision',async()=>{
  await write(b,joined.id,60);
  const [summary]=await Promise.all([
    service.summary({identity:b,enrollmentId:joined.id}),
    service.reviseWeights({identity:a,sectionId:created.section.id,input:revisions()}),
  ]);
  expect([[1,24],[2,18]]).toContainEqual([summary.structureRevision,summary.currentWeightedScore]);
});
test('score zero differs from missing; maximum passes; PUT updates instead of duplicating',async()=>{
  const enrollmentId=created.enrollment.id;
  expect((await service.summary({identity:a,enrollmentId})).gradedWeightPercent).toBe(0);
  await write(a,enrollmentId,0);
  expect((await service.summary({identity:a,enrollmentId})).gradedWeightPercent).toBe(40);
  await write(a,enrollmentId,100);
  expect((await pool.query('SELECT count(*) FROM scores')).rows[0].count).toBe('1');
  expect((await service.summary({identity:a,enrollmentId})).currentWeightedScore).toBe(40);
  await service.writeComponent({identity:a,enrollmentId,componentId:created.section.components[0].id,kind:'score',remove:true});
  expect((await service.summary({identity:a,enrollmentId})).gradedWeightPercent).toBe(0);
});
test.each([-1,101,NaN,Infinity,'80'])('invalid raw score rejected: %s',async score=>{
  await expect(write(a,created.enrollment.id,score)).rejects.toMatchObject({status:400});
});
test('foreign component cannot be used for a score or deletion',async()=>{
  const other=await service.createSection({identity:b,input:input()});
  await expect(write(a,created.enrollment.id,50,other.section.components[0].id)).rejects.toMatchObject({status:400});
  await expect(service.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:other.section.components[0].id,kind:'score',remove:true})).rejects.toMatchObject({status:400});
});
test('attendance derives score and requires explicit source deletion',async()=>{
  const args={identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id};
  await service.writeComponent({...args,kind:'attendance',input:{attended:8,totalSessions:10}});
  expect((await service.summary({identity:a,enrollmentId:args.enrollmentId})).currentWeightedScore).toBe(32);
  await expect(write(a,args.enrollmentId,90)).rejects.toMatchObject({code:'ATTENDANCE_SOURCE_EXISTS'});
  await service.writeComponent({...args,kind:'attendance',remove:true});
  await write(a,args.enrollmentId,90);
  await expect(service.writeComponent({...args,kind:'attendance',input:{attended:8,totalSessions:10}})).rejects.toMatchObject({code:'SCORE_SOURCE_EXISTS'});
});
test.each([{attended:-1,totalSessions:10},{attended:1.5,totalSessions:10},{attended:0,totalSessions:0},{attended:11,totalSessions:10}])('invalid attendance rejected: %j',async input=>{
  await expect(service.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id,kind:'attendance',input})).rejects.toMatchObject({status:400});
});
test('saved targets persist and norm targets fail explicitly',async()=>{
  await service.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{targetGrade:'A'}});
  expect((await service.detail({identity:a,enrollmentId:created.enrollment.id})).enrollment.targetGrade).toBe('A');
  const norm=await service.createSection({identity:a,input:{...input(),gradingMode:'norm',gradeThresholds:null}});
  await expect(service.updateTarget({identity:a,enrollmentId:norm.enrollment.id,input:{targetGrade:'A'}})).rejects.toMatchObject({code:'NORM_GRADE_UNAVAILABLE'});
  expect((await service.summary({identity:a,enrollmentId:norm.enrollment.id})).projectedGrade).toBeNull();
});
test('every implemented academic writer refuses withdrawn consent',async()=>{
  await consent.deleteData({identity:a});
  const calls=[
    ()=>service.createSection({identity:a,input:input()}),
    ()=>service.joinSection({identity:a,code:created.section.joinCode}),
    ()=>service.reviseWeights({identity:a,sectionId:created.section.id,input:revisions()}),
    ()=>write(a,created.enrollment.id,50),
    ()=>service.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id,kind:'attendance',input:{attended:1,totalSessions:2}}),
    ()=>service.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id,kind:'score',remove:true}),
    ()=>service.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id,kind:'attendance',remove:true}),
    ()=>service.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{targetGrade:'B'}}),
  ];
  for(const call of calls) await expect(call()).rejects.toMatchObject({status:403});
});
test('real HTTP create/join/score/summary/revision flow uses verified identity',async()=>{
  const app=createApp({pool,consentService:consent,verifyIdentity:async token=>token==='a'?a:b});
  const req=(verb,url,who='a')=>request(app)[verb](url).set('Authorization','Bearer '+who);
  const made=await req('post','/api/v1/sections').send(input());
  expect(made.status).toBe(201);
  const data=made.body.data;
  expect((await req('post','/api/v1/sections/join','b').send({joinCode:data.section.joinCode})).status).toBe(201);
  expect((await req('put','/api/v1/enrollments/'+data.enrollment.id+'/scores/'+data.section.components[0].id).send({score:80})).status).toBe(200);
  expect((await req('get','/api/v1/enrollments/'+data.enrollment.id+'/summary')).body.data.currentWeightedScore).toBe(32);
  expect((await req('get','/api/v1/enrollments/'+data.enrollment.id,'b')).status).toBe(404);
});

