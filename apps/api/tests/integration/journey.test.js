'use strict';
const {Pool}=require('pg');
const request=require('supertest');
const {migrate,normaliseSql}=require('../../src/db/migrate');
const {createConsentService}=require('../../src/services/consent-service');
const {createAcademicService}=require('../../src/services/academic-service');
const {createGpaxService}=require('../../src/services/gpax-service');
const {createNotificationService}=require('../../src/services/notification-service');
const {createApp}=require('../../src/app');
const fs=require('node:fs/promises');
const path=require('node:path');
const url=process.env.TEST_DATABASE_URL;
if(!url||!/\/rordmai_test(?:\?|$)/.test(url))throw Error('Use disposable rordmai_test.');
const pool=new Pool({connectionString:url});
const consent=createConsentService({pool,currentPolicyVersion:'v1'});
const academic=createAcademicService({consentService:consent});
const gpax=createGpaxService({consentService:consent});
const a={lineUserId:'journey-a'},b={lineUserId:'journey-b'},absent={lineUserId:'journey-no-consent'};
const app=createApp({pool,consentService:consent,verifyIdentity:async token=>token==='a'?a:token==='b'?b:absent});
const input={courseCode:'JOURNEY',courseName:'Fictional course',sectionNumber:'1',academicYear:2026,semester:1,credits:3,gradingMode:'criterion',withdrawalDeadline:'2026-10-15',gradeThresholds:{A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50},components:[{name:'Midterm',weightPercent:40,maximumScore:100,inputType:'marks'},{name:'Final',weightPercent:60,maximumScore:100,inputType:'marks'}]};
let created;
beforeAll(async()=>{await migrate(pool);});
beforeEach(async()=>{await pool.query('TRUNCATE students,sections CASCADE');for(const identity of [a,b])await consent.grantStorageConsent({identity,accepted:true,policyVersion:'v1'});created=await academic.createSection({identity:a,input});});
afterAll(async()=>pool.end());
const preview=(token,code=created.section.joinCode)=>request(app).post('/api/v1/sections/preview').set('Authorization','Bearer '+token).send({joinCode:code});
test('preview requires identity and storage consent, validates codes, and writes no enrollment',async()=>{
  expect((await request(app).post('/api/v1/sections/preview').send({joinCode:created.section.joinCode})).status).toBe(401);
  expect((await preview('absent')).status).toBe(403);
  expect((await preview('b','bad')).status).toBe(400);expect((await preview('b','ZZZZZZ')).status).toBe(404);
  const before=(await pool.query('SELECT count(*) FROM enrollments')).rows[0].count;
  const response=await preview('b',' '+created.section.joinCode.toLowerCase()+' ');
  expect(response.status).toBe(200);expect(response.body.data.enrollmentId).toBeNull();
  expect(response.body.data.section.courseCode).toBe('JOURNEY');expect(response.body.data.section.components).toHaveLength(2);
  expect(response.body.data.section).not.toHaveProperty('canEdit');expect(response.body.data.section).not.toHaveProperty('creatorId');
  expect(JSON.stringify(response.body)).not.toMatch(/scores|lineUserId|studentId|creator_id/);
  expect((await pool.query('SELECT count(*) FROM enrollments')).rows[0].count).toBe(before);
  expect((await request(app).get('/api/v1/sections/'+created.section.id).set('Authorization','Bearer b')).status).toBe(404);
});
test('preview returns only the requesters own enrollment after confirmation',async()=>{
  const joined=await academic.joinSection({identity:b,code:created.section.joinCode});
  expect((await preview('b')).body.data.enrollmentId).toBe(joined.id);
  expect((await preview('a')).body.data.enrollmentId).toBe(created.enrollment.id);
  await expect(academic.joinSection({identity:b,code:created.section.joinCode})).rejects.toMatchObject({code:'ALREADY_ENROLLED'});
});
test('term-only profiles retain null baseline and block GPAX until the baseline is supplied',async()=>{
  const term={academicYear:2026,semester:2,currentGpa:null,creditsCounted:null};
  expect(await gpax.saveProfile({identity:a,input:term})).toEqual(term);expect(await gpax.getProfile({identity:a})).toEqual(term);
  const cases={scenarios:[{label:'Stay',outcomes:[{enrollmentId:created.enrollment.id,outcome:'grade',grade:'A'}]}]};
  await expect(gpax.calculate({identity:a,input:cases})).rejects.toMatchObject({code:'PROFILE_REQUIRED'});
  await gpax.saveProfile({identity:a,input:{...term,currentGpa:3,creditsCounted:30}});
  expect((await gpax.calculate({identity:a,input:cases})).results[0].gpax).toBe(102/33);
});
test.each([{currentGpa:null,creditsCounted:30},{currentGpa:3,creditsCounted:null},{currentGpa:3,creditsCounted:0},{currentGpa:5,creditsCounted:30},{currentGpa:'',creditsCounted:''}])('incomplete or invalid baseline is rejected: %j',async baseline=>{
  await expect(async()=>gpax.saveProfile({identity:a,input:{academicYear:2026,semester:1,...baseline}})).rejects.toMatchObject({code:'VALIDATION_ERROR'});
});
test('new Flex payload and retry key are persisted unchanged; legacy text still sends',async()=>{
  await academic.updateTarget({identity:a,enrollmentId:created.enrollment.id,input:{targetGrade:'A'}});
  await academic.writeComponent({identity:a,enrollmentId:created.enrollment.id,componentId:created.section.components[0].id,kind:'score',input:{score:0}});
  let now=new Date('2026-10-07T10:00:00Z');
  const messaging={push:jest.fn().mockRejectedValueOnce(Object.assign(Error('retry'),{retryable:true})).mockResolvedValue(undefined)};
  const notifications=createNotificationService({pool,consentService:consent,messaging,liffId:'123-test',now:()=>now});
  await notifications.run();const first=messaging.push.mock.calls[0];
  expect(first[1].type).toBe('flex');expect(first[1].contents.header.backgroundColor).toBe('#b65a00');
  const links=first[1].contents.footer.contents.map(button=>button.action.uri);
  expect(links).toEqual(['course','gpax'].map(view=>'https://liff.line.me/123-test/?view='+view+'&enrollmentId='+created.enrollment.id));
  expect(JSON.stringify(first[1])).toContain('not advice to withdraw');
  await pool.query('UPDATE sections SET course_name=$1 WHERE id=$2',['Changed course name',created.section.id]);
  now=new Date('2026-10-07T10:02:00Z');await notifications.run();expect(messaging.push.mock.calls[1]).toEqual(first);
  await pool.query("UPDATE deadline_notifications SET status='pending',attempts=0,next_attempt_at=$1,message_payload=NULL,message='Legacy reminder'",[now]);
  await notifications.run();expect(messaging.push.mock.calls[2][1]).toBe('Legacy reminder');
});
test('migration preserves existing baseline; rollback refuses term-only data instead of discarding it',async()=>{
  const client=await pool.connect();
  try{
    await client.query('CREATE SCHEMA journey_upgrade');await client.query('SET search_path TO journey_upgrade');
    const sql=async file=>client.query(normaliseSql(await fs.readFile(path.resolve(__dirname,'../../../../migrations',file),'utf8')));
    const files=(await fs.readdir(path.resolve(__dirname,'../../../../migrations'))).filter(n=>n.endsWith('.up.sql')).sort();
    for(const file of files.filter(n=>!n.startsWith('007')))await sql(file);
    const id=(await client.query("INSERT INTO students(line_user_id,storage_consent,storage_policy_version,storage_consented_at) VALUES ('journey-migration',TRUE,'v1',CURRENT_TIMESTAMP) RETURNING id")).rows[0].id;
    await client.query('INSERT INTO academic_profiles VALUES ($1,3,30,2026,1)',[id]);await sql('007_reference_journey.up.sql');
    expect((await client.query('SELECT current_gpa,credits_counted FROM academic_profiles')).rows[0]).toEqual({current_gpa:'3',credits_counted:30});
    await expect(client.query('UPDATE academic_profiles SET current_gpa=NULL')).rejects.toMatchObject({code:'23514'});
    await client.query('UPDATE academic_profiles SET current_gpa=NULL,credits_counted=NULL');
    await expect(sql('007_reference_journey.down.sql')).rejects.toThrow('Complete optional profiles');
    await client.query('UPDATE academic_profiles SET current_gpa=3,credits_counted=30');await sql('007_reference_journey.down.sql');await sql('007_reference_journey.up.sql');
  }finally{await client.query('SET search_path TO public');await client.query('DROP SCHEMA journey_upgrade CASCADE');client.release();}
});
