const {Pool}=require('pg');
const request=require('supertest');
const sharp=require('sharp');
const fs=require('node:fs/promises');
const path=require('node:path');
const {migrate,normaliseSql}=require('../../src/db/migrate');
const {createConsentService}=require('../../src/services/consent-service');
const {createAcademicService}=require('../../src/services/academic-service');
const {createGpaxService}=require('../../src/services/gpax-service');
const {createExplanationService}=require('../../src/services/explanation-service');
const {createNotificationService}=require('../../src/services/notification-service');
const {createOcrService}=require('../../src/services/ocr-service');
const {createApp}=require('../../src/app');
const url=process.env.TEST_DATABASE_URL;
if(!url||!/\/rordmai_test(?:\?|$)/.test(url))throw Error('Use disposable rordmai_test.');
const pool=new Pool({connectionString:url,max:8,statement_timeout:8000});
const consent=createConsentService({pool,currentPolicyVersion:'v1'});
const academic=createAcademicService({consentService:consent});
const gpax=createGpaxService({consentService:consent});
const a={lineUserId:'features-a'},b={lineUserId:'features-b'};
const input=()=>({courseCode:'TEST',courseName:'Fictional course',sectionNumber:'1',academicYear:2026,semester:1,credits:3,
  gradingMode:'criterion',withdrawalDeadline:'2026-10-07',gradeThresholds:{A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50},
  components:[{name:'Midterm',weightPercent:40,maximumScore:100,inputType:'marks'},{name:'Final',weightPercent:60,maximumScore:100,inputType:'marks'}]});
const profile={currentGpa:3,creditsCounted:30,academicYear:2026,semester:1};
const grant=(identity=a,external=false)=>consent.grantStorageConsent({identity,accepted:true,policyVersion:'v1',crossBorderExplanation:external});
let created,joined;
beforeAll(async()=>{await migrate(pool);});
afterAll(async()=>{await pool.end();});
beforeEach(async()=>{
  await pool.query('TRUNCATE students,sections CASCADE');await grant();await grant(b);
  created=await academic.createSection({identity:a,input:input()});joined=await academic.joinSection({identity:b,code:created.section.joinCode});
});
const cases=id=>({scenarios:[{label:'Stay',outcomes:[{enrollmentId:id,outcome:'grade',grade:'A'}]},
  {label:'Withdraw',outcomes:[{enrollmentId:id,outcome:'withdraw'}]}]});
const unreachable=async()=>{
  await academic.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{targetGrade:'A'}});
  await academic.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id,kind:'score',input:{score:0}});
};
const notifications=(messaging,clock=()=>new Date('2026-10-07T10:00:00Z'))=>createNotificationService({pool,consentService:consent,messaging,liffId:'123-test',now:clock});
test('profiles persist per student and scenarios use owned server credits and full precision',async()=>{
  await expect(gpax.calculate({identity:a,input:cases(created.enrollment.id)})).rejects.toMatchObject({code:'PROFILE_REQUIRED'});
  expect(await gpax.saveProfile({identity:a,input:profile})).toEqual(profile);
  await expect(gpax.getProfile({identity:b})).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
  const result=await gpax.calculate({identity:a,input:cases(created.enrollment.id)});
  expect(result.results[0].gpax).toBe(102/33);expect(result.results[1].gpax).toBe(3);expect(result.results[0].creditsCounted).toBe(33);
  expect(result.comparison).toEqual({stay:102/33,withdraw:3,delta:3-102/33});
  expect((await gpax.calculate({identity:a,input:{scenarios:[cases(created.enrollment.id).scenarios[0]]}})).comparison).toBeNull();
  expect((await gpax.calculate({identity:a,input:{scenarios:[...cases(created.enrollment.id).scenarios].reverse()}})).comparison).toBeNull();
  await expect(gpax.calculate({identity:a,input:cases(joined.id)})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
  await expect(async()=>gpax.saveProfile({identity:a,input:{...profile,currentGpa:'3'}})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
test('repeat metadata is editable/readable and blocks all repeat GPAX until verified',async()=>{
  await gpax.saveProfile({identity:a,input:profile});
  const updated=await academic.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{repeat:{previousGradePoint:0}}});
  expect(updated.repeat).toEqual({previousGradePoint:0});expect((await academic.detail({identity:a,enrollmentId:created.enrollment.id})).enrollment.repeat).toEqual({previousGradePoint:0});
  await expect(gpax.calculate({identity:a,input:cases(created.enrollment.id)})).rejects.toMatchObject({code:'REPEAT_RULE_UNVERIFIED'});
  await expect(academic.updateTarget({identity:b,enrollmentId:created.enrollment.id,input:{repeat:null}})).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
  await academic.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{repeat:null}});
  expect((await gpax.calculate({identity:a,input:cases(created.enrollment.id)})).results).toHaveLength(2);
});
test('scenario labels and outcomes must be unique and cover every enrolled course',async()=>{
  await gpax.saveProfile({identity:a,input:profile});
  const good=cases(created.enrollment.id).scenarios[0];
  for(const scenarios of [[good,good],[{...good,outcomes:[]}],[{...good,outcomes:[...good.outcomes,...good.outcomes]}],
    [{...good,outcomes:[{...good.outcomes[0],grade:{toString:null}}]}],[{...good,outcomes:[null]}]])
    await expect(gpax.calculate({identity:a,input:{scenarios}})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
test('external consent defaults off, produces zero outbound calls, toggles independently and validates model numbers',async()=>{
  const generateText=jest.fn(async()=> 'คะแนน {{current}} ประเมิน {{graded}} เหลือ {{remaining}} สูงสุด {{maximum}}');
  const service=createExplanationService({consentService:consent,gpaxService:gpax,generateText});
  const args={identity:a,enrollmentId:created.enrollment.id,input:{kind:'summary'}};
  expect((await service.explain(args)).source).toBe('template');expect(generateText).not.toHaveBeenCalled();
  await grant(a,true);expect((await consent.getConsent({identity:a})).crossBorderExplanation).toBe(true);
  expect((await service.explain(args)).source).toBe('llm');
  const revisedConsent=createConsentService({pool,currentPolicyVersion:'v2'});
  const revisedService=createExplanationService({consentService:revisedConsent,gpaxService:gpax,generateText});
  generateText.mockClear();expect((await revisedService.explain(args)).source).toBe('template');expect(generateText).not.toHaveBeenCalled();
  expect((await revisedConsent.getConsent({identity:a})).crossBorderExplanation).toBe(false);
  await service.explain(args);
  expect(JSON.stringify(generateText.mock.calls[0][0])).not.toContain('features-a');expect(JSON.stringify(generateText.mock.calls[0][0])).not.toContain(created.section.id);
  generateText.mockResolvedValue('คะแนน 999');expect((await service.explain(args)).source).toBe('template');
  generateText.mockRejectedValue(Error('timeout'));expect((await service.explain(args)).source).toBe('template');
  await grant(a,false);generateText.mockClear();expect((await service.explain(args)).source).toBe('template');expect(generateText).not.toHaveBeenCalled();
  expect((await consent.getConsent({identity:a})).storage).toBe(true);
});
test('withdrawal explanations require a paired comparison differing only in the selected course',async()=>{
  await gpax.saveProfile({identity:a,input:profile});
  const service=createExplanationService({consentService:consent,gpaxService:gpax});
  const scenarios=cases(created.enrollment.id).scenarios;
  expect((await service.explain({identity:a,enrollmentId:created.enrollment.id,input:{kind:'withdrawal',scenarios}})).text).toContain('3.09');
  await expect(service.explain({identity:b,enrollmentId:created.enrollment.id,input:{kind:'summary'}})).rejects.toMatchObject({code:'RESOURCE_NOT_FOUND'});
  await expect(service.explain({identity:a,enrollmentId:created.enrollment.id,input:{kind:'withdrawal',scenarios:[scenarios[1],scenarios[0]]}})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
test('deadline sends deduplicate overlapping workers and stay deduplicated after restart',async()=>{
  await unreachable();const messaging={push:jest.fn(async()=>{})};
  await Promise.all([notifications(messaging).run(),notifications(messaging).run()]);
  expect(messaging.push).toHaveBeenCalledTimes(1);await notifications(messaging).run();expect(messaging.push).toHaveBeenCalledTimes(1);
  const row=(await pool.query('SELECT * FROM deadline_notifications')).rows[0];expect(row.status).toBe('sent');expect(row.attempts).toBe(1);
});
test('transient pushes use the persisted key/body for three attempts with 1 and 5 minute delays',async()=>{
  await unreachable();let time=new Date('2026-10-07T10:00:00Z');
  const messaging={push:jest.fn(async()=>{throw Object.assign(Error('network'),{retryable:true});})};
  const run=()=>notifications(messaging,()=>time).run();
  const first=await run();expect(first.nextRetryAt).toBe('2026-10-07T10:01:00.000Z');
  await run();expect(messaging.push).toHaveBeenCalledTimes(1);
  time=new Date(first.nextRetryAt);const second=await run();expect(second.nextRetryAt).toBe('2026-10-07T10:06:00.000Z');
  time=new Date(second.nextRetryAt);await run();await run();expect(messaging.push).toHaveBeenCalledTimes(3);
  expect(new Set(messaging.push.mock.calls.map(args=>args[2])).size).toBe(1);expect(new Set(messaging.push.mock.calls.map(args=>args[1])).size).toBe(1);
  expect((await pool.query('SELECT status,attempts FROM deadline_notifications')).rows).toEqual([{status:'failed',attempts:3}]);
});
test('deadline cutoff, changed targets, withdrawn consent and stale work stop delivery',async()=>{
  await unreachable();const messaging={push:jest.fn(async()=>{throw Object.assign(Error(),{retryable:true});})};
  await notifications(messaging).run();expect(messaging.push).toHaveBeenCalledTimes(1);
  await academic.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{targetGrade:'D'}});
  await notifications(messaging,()=>new Date('2026-10-07T10:02:00Z')).run();expect(messaging.push).toHaveBeenCalledTimes(1);
  expect((await pool.query('SELECT status FROM deadline_notifications')).rows[0].status).toBe('cancelled');
  await consent.deleteData({identity:a});await grant();await notifications(messaging).run();expect(messaging.push).toHaveBeenCalledTimes(1);
  expect((await pool.query('SELECT count(*) FROM deadline_notifications')).rows[0].count).toBe('0');
  expect((await academic.detail({identity:b,enrollmentId:joined.id})).section.id).toBe(created.section.id);
});
test('no notification is sent at or after the next Bangkok midnight',async()=>{
  await unreachable();const messaging={push:jest.fn(async()=>{})};
  await notifications(messaging,()=>new Date('2026-10-07T17:00:00Z')).run();expect(messaging.push).not.toHaveBeenCalled();
});
test('withdrawal waits for a bounded outbound explanation and removes all new private records',async()=>{
  await gpax.saveProfile({identity:a,input:profile});await grant(a,true);
  let finish,started;
  const ready=new Promise(resolve=>{started=resolve;});
  const service=createExplanationService({consentService:consent,gpaxService:gpax,generateText:async()=>{
    started();return new Promise(resolve=>{finish=resolve;});
  }});
  const explanation=service.explain({identity:a,enrollmentId:created.enrollment.id,input:{kind:'summary'}});await ready;
  let deleted=false;const deletion=consent.deleteData({identity:a}).then(()=>{deleted=true;});
  await new Promise(resolve=>setTimeout(resolve,30));expect(deleted).toBe(false);
  finish('คะแนน {{current}} ประเมิน {{graded}} เหลือ {{remaining}} สูงสุด {{maximum}}');await explanation;await deletion;
  expect((await pool.query('SELECT count(*) FROM academic_profiles')).rows[0].count).toBe('0');
  expect((await academic.detail({identity:b,enrollmentId:joined.id})).section.canEdit).toBe(false);
});
test('multipart OCR rejects PDFs and consentless uploads; a draft writes no academic records',async()=>{
  const ocrService=createOcrService({recognizeImage:async()=> 'Midterm 40%\nFinal 60%'});
  const app=createApp({pool,consentService:consent,ocrService,verifyIdentity:async token=>token==='a'?a:{lineUserId:'no-consent'}});
  const post=token=>request(app).post('/api/v1/ocr/syllabus').set('Authorization','Bearer '+token);
  const png=await sharp({create:{width:10,height:10,channels:3,background:'white'}}).png().toBuffer();
  expect((await post('a').attach('image',Buffer.from('%PDF pretend'),'renamed.png')).status).toBe(415);
  expect((await post('no-consent').attach('image',png,'syllabus.png')).status).toBe(403);
  const before=(await pool.query('SELECT count(*) FROM sections')).rows[0].count;
  const response=await post('a').attach('image',png,'syllabus.png');expect(response.status).toBe(200);expect(response.body.data.requiresConfirmation).toBe(true);
  expect((await pool.query('SELECT count(*) FROM sections')).rows[0].count).toBe(before);
});
test('forward/down/reapply migration preserves the cumulative profile on an existing schema',async()=>{
  const client=await pool.connect();
  try{
    await client.query('CREATE SCHEMA feature_upgrade');await client.query('SET search_path TO feature_upgrade');
    const sql=async name=>client.query(normaliseSql(await fs.readFile(path.resolve(__dirname,'../../../../migrations',name),'utf8')));
    for(const name of ['001_core','002_storage_consent','003_privacy_lifecycle','004_component_order','005_assessment_input_type'])await sql(name+'.up.sql');
    const id=(await client.query("INSERT INTO students(line_user_id,storage_consent,storage_policy_version,storage_consented_at) VALUES ('migration-only',TRUE,'v1',CURRENT_TIMESTAMP) RETURNING id")).rows[0].id;
    await client.query('INSERT INTO academic_profiles VALUES ($1,3,30,2026,1)',[id]);
    await sql('006_remaining_functions.up.sql');expect((await client.query('SELECT credits_counted FROM academic_profiles')).rows[0].credits_counted).toBe(30);
    await sql('006_remaining_functions.down.sql');expect((await client.query('SELECT credits_earned FROM academic_profiles')).rows[0].credits_earned).toBe(30);
    await sql('006_remaining_functions.up.sql');expect((await client.query('SELECT cross_border_explanation FROM students')).rows[0].cross_border_explanation).toBe(false);
  }finally{await client.query('SET search_path TO public');await client.query('DROP SCHEMA feature_upgrade CASCADE');client.release();}
});
