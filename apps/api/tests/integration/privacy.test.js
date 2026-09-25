const { Pool } = require('pg');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { migrate, normaliseSql } = require('../../src/db/migrate');
const { createConsentService } = require('../../src/services/consent-service');
const { requireOwnedEnrollment, listOwnedEnrollments, requireCurrentJob } = require('../../src/repositories/academic-repository');
const request = require('supertest');
const { createApp } = require('../../src/app');
const url = process.env.TEST_DATABASE_URL;
if (!url || !/\/rordmai_test(?:\?|$)/.test(url)) throw new Error('TEST_DATABASE_URL must name a disposable rordmai_test database.');
const pool = new Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 3000, statement_timeout: 8000 });
const service = createConsentService({ pool, currentPolicyVersion: 'v1' });
const a = { lineUserId: 'test-a' }, b = { lineUserId: 'test-b' };
const grant = (identity = a) => service.grantStorageConsent({ identity, accepted: true, policyVersion: 'v1' });
let aId, bId, sectionId, componentId, enrollmentA, enrollmentB;
beforeAll(async () => { await migrate(pool); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => {
  await pool.query('TRUNCATE students, sections CASCADE');
});
const fixture = async () => {
  aId = (await grant()).id; bId = (await grant(b)).id;
  sectionId = (await pool.query(`INSERT INTO sections (join_code,course_code,course_name,section_number,academic_year,semester,credits,grading_mode,withdrawal_deadline,creator_id)
    VALUES ('ABC123','TEST','Fictional course','1',2026,1,3,'norm','2026-10-01',$1) RETURNING id`, [aId])).rows[0].id;
  componentId = (await pool.query("INSERT INTO components(section_id,name,weight_percent,maximum_score) VALUES ($1,'Exam',100,100) RETURNING id", [sectionId])).rows[0].id;
  enrollmentA = (await pool.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2) RETURNING id', [aId,sectionId])).rows[0].id;
  enrollmentB = (await pool.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2) RETURNING id', [bId,sectionId])).rows[0].id;
  await pool.query('INSERT INTO scores(enrollment_id,component_id,section_id,score) VALUES ($1,$3,$4,80),($2,$3,$4,60)',[enrollmentA,enrollmentB,componentId,sectionId]);
};
test('migrations rerun without applying versions again', async () => {
  expect(await migrate(pool)).toEqual([]);
  expect(Number((await pool.query('SELECT count(*) FROM schema_migrations')).rows[0].count)).toBe(4);
});
test('migration down/reapply succeeds in a separate disposable schema', async () => {
  const client = await pool.connect();
  try {
    await client.query('CREATE SCHEMA rollback_check');
    await client.query('SET search_path TO rollback_check');
    for (const file of ['001_core.up.sql','002_storage_consent.up.sql','003_privacy_lifecycle.up.sql','004_component_order.up.sql',
      '004_component_order.down.sql','003_privacy_lifecycle.down.sql','002_storage_consent.down.sql','001_core.down.sql',
      '001_core.up.sql','002_storage_consent.up.sql','003_privacy_lifecycle.up.sql','004_component_order.up.sql']) {
      await client.query(normaliseSql(await fs.readFile(path.resolve(__dirname, '../../../../migrations',file),'utf8')));
    }
    expect((await client.query('SELECT * FROM students')).rows).toEqual([]);
  } finally {
    await client.query('SET search_path TO public');
    await client.query('DROP SCHEMA rollback_check CASCADE');
    client.release();
  }
});
test('failed migration leaves no partial schema or applied marker', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(),'rordmai-migration-'));
  try {
    await fs.writeFile(path.join(dir,'999_failure.up.sql'),'CREATE TABLE must_rollback(id integer); SELECT definitely_missing_function();');
    await expect(migrate(pool,dir)).rejects.toBeDefined();
    expect((await pool.query("SELECT to_regclass('public.must_rollback') AS name")).rows[0].name).toBeNull();
    expect((await pool.query("SELECT name FROM schema_migrations WHERE name='999_failure.up.sql'")).rows).toHaveLength(0);
  } finally { await fs.rm(dir,{ recursive:true, force:true }); }
});
test('consent read and decline create no student; repeated grant preserves identity and evidence', async () => {
  expect((await service.getConsent({ identity:a })).storage).toBe(false);
  await expect(service.grantStorageConsent({ identity:a, accepted:false,policyVersion:'v1' })).rejects.toMatchObject({ status:400 });
  expect((await pool.query('SELECT * FROM students')).rows).toHaveLength(0);
  const first = await grant(), second = await grant();
  expect(second.id).toBe(first.id);
  expect(second.storage_consented_at).toEqual(first.storage_consented_at);
});
test('invalid policy and absent consent reject without storing data', async () => {
  await expect(service.grantStorageConsent({ identity:a,accepted:true,policyVersion:'old' })).rejects.toMatchObject({ status:409 });
  await expect(service.withStorageConsent({ identity:a },async()=>{})).rejects.toMatchObject({ status:403 });
});
test('injection-shaped identity is stored only as data', async () => {
  const identity = { lineUserId: "'; DROP TABLE students; --" };
  await grant(identity);
  expect((await service.getConsent({ identity })).storage).toBe(true);
  expect((await pool.query('SELECT count(*) FROM students')).rows[0].count).toBe('1');
});
test('failed writer rolls back and releases connection', async () => {
  await fixture();
  await expect(service.withStorageConsent({ identity:a },async({client})=>{
    await client.query('UPDATE scores SET score=5 WHERE enrollment_id=$1',[enrollmentA]);
    throw Error('deliberate failure');
  })).rejects.toThrow('deliberate failure');
  expect(Number((await pool.query('SELECT score FROM scores WHERE enrollment_id=$1',[enrollmentA])).rows[0].score)).toBe(80);
  expect(pool.waitingCount).toBe(0);
});
test('private repository checks ownership and isolates lists', async () => {
  await fixture();
  await service.withStorageConsent({identity:a},async({client,studentId})=>{
    await expect(requireOwnedEnrollment(client,studentId,enrollmentB)).rejects.toMatchObject({status:404});
    expect((await listOwnedEnrollments(client,studentId)).items.map(x=>x.id)).toEqual([enrollmentA]);
  });
});
test('delete cascades all private tables while preserving classmates and anonymising shared structures', async () => {
  await fixture();
  await pool.query('INSERT INTO academic_profiles VALUES ($1,3,30,2026,1)',[aId]);
  await pool.query('INSERT INTO attendance VALUES ($1,$2,$3,8,10,CURRENT_TIMESTAMP)',[enrollmentA,componentId,sectionId]);
  await pool.query("INSERT INTO conversation_state VALUES ($1,'{}',CURRENT_TIMESTAMP + interval '1 hour')",[aId]);
  await pool.query("INSERT INTO private_jobs(student_id,event_id,kind,payload,expires_at) VALUES ($1,'event-a','score','{}',CURRENT_TIMESTAMP+interval '1 hour')",[aId]);
  await pool.query("INSERT INTO grading_revisions(section_id,revision,actor_id,previous_weights,new_weights) VALUES ($1,2,$2,'[]','[]')",[sectionId,aId]);
  await service.deleteData({identity:a});
  await service.deleteData({identity:a});
  const remaining = (await pool.query(`SELECT
    (SELECT count(*) FROM academic_profiles) AS profiles,
    (SELECT count(*) FROM attendance) AS attendance,
    (SELECT count(*) FROM conversation_state) AS conversations,
    (SELECT count(*) FROM private_jobs) AS jobs`)).rows[0];
  expect(remaining).toEqual({profiles:'0',attendance:'0',conversations:'0',jobs:'0'});
  expect((await pool.query('SELECT creator_id FROM sections WHERE id=$1',[sectionId])).rows[0].creator_id).toBeNull();
  expect((await pool.query('SELECT actor_id FROM grading_revisions')).rows[0].actor_id).toBeNull();
  const scores = (await pool.query('SELECT enrollment_id,score FROM scores')).rows;
  expect(scores).toEqual([{enrollment_id:enrollmentB,score:'60'}]);
  expect((await service.getConsent({identity:a})).storage).toBe(false);
  const renewed = await grant();
  expect(renewed.id).not.toBe(aId);
  expect((await pool.query('SELECT * FROM enrollments WHERE student_id=$1',[renewed.id])).rows).toHaveLength(0);
});
const waitForBlockedQuery = async (pattern) => {
  const deadline = Date.now()+4000;
  while (Date.now()<deadline) {
    const result = await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE $1",[pattern]);
    if (result.rows.length) return;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  throw Error('Expected a blocked database query.');
};
test('writer-first commits before waiting deletion removes the new data', async () => {
  await fixture();
  let releaseWriter, locked;
  const held = new Promise(resolve=>{releaseWriter=resolve;});
  const started = new Promise(resolve=>{locked=resolve;});
  const write = service.withStorageConsent({identity:a},async({client})=>{
    locked(); await held;
    await client.query('UPDATE scores SET score=91 WHERE enrollment_id=$1',[enrollmentA]);
  });
  await started;
  const deletion = service.deleteData({identity:a});
  try { await waitForBlockedQuery('%SELECT id FROM students%'); }
  finally { releaseWriter(); }
  await Promise.all([write,deletion]);
  expect((await pool.query('SELECT * FROM scores WHERE enrollment_id=$1',[enrollmentA])).rows).toHaveLength(0);
});
test('withdrawal-first makes a waiting writer fail without recreating records', async () => {
  await fixture();
  const deleting = await pool.connect();
  await deleting.query('BEGIN');
  await deleting.query('SELECT id FROM students WHERE id=$1 FOR UPDATE',[aId]);
  await deleting.query('DELETE FROM students WHERE id=$1',[aId]);
  const write = service.withStorageConsent({identity:a},async()=>{throw Error('Writer must not run');});
  const outcome = write.then(()=>null,error=>error);
  try { await waitForBlockedQuery('%SELECT id, storage_consent%'); await deleting.query('COMMIT'); }
  finally { await deleting.query('ROLLBACK'); deleting.release(); }
  expect(await outcome).toMatchObject({status:403});
  expect((await pool.query('SELECT * FROM students WHERE id=$1',[aId])).rows).toHaveLength(0);
});
test('stale jobs cannot act after deletion and renewed consent', async () => {
  await fixture();
  const job = (await pool.query("INSERT INTO private_jobs(student_id,event_id,kind,payload,expires_at) VALUES ($1,'stale','score','{}',CURRENT_TIMESTAMP+interval '1 hour') RETURNING id",[aId])).rows[0].id;
  await service.deleteData({identity:a}); await grant();
  await expect(service.withStorageConsent({identity:a},({client,studentId})=>requireCurrentJob(client,studentId,job))).rejects.toMatchObject({status:404});
});
test('concurrent grants preserve uniqueness', async () => {
  const results = await Promise.all(Array.from({length:5},()=>grant()));
  expect(new Set(results.map(x=>x.id)).size).toBe(1);
});
test('foreign keys and unique enrolment prevent invalid relationships', async () => {
  await fixture();
  await expect(pool.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2)',[aId,sectionId])).rejects.toMatchObject({code:'23505'});
  await expect(pool.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2)',['00000000-0000-0000-0000-000000000000',sectionId])).rejects.toMatchObject({code:'23503'});
});
test('real HTTP consent lifecycle operates on PostgreSQL', async () => {
  const app = createApp({pool,consentService:service,verifyIdentity:async()=>a});
  const auth = req=>req.set('Authorization','Bearer test-adapter');
  expect((await auth(request(app).get('/api/v1/consents'))).body.data.storage).toBe(false);
  expect((await auth(request(app).put('/api/v1/consents')).send({storage:true,crossBorderExplanation:false,policyVersion:'v1'})).status).toBe(200);
  expect((await auth(request(app).get('/api/v1/enrollments'))).body.data.items).toEqual([]);
  expect((await auth(request(app).delete('/api/v1/me/data')).send({confirmDeletion:true})).status).toBe(204);
  expect((await pool.query('SELECT * FROM students')).rows).toHaveLength(0);
});

test('database rejects cross-section scores and preserves decimal weights', async () => {
  await fixture();
  const other = (await pool.query(`INSERT INTO sections(join_code,course_code,course_name,section_number,academic_year,semester,credits,grading_mode,withdrawal_deadline)
    VALUES ('DEF456','OTHER','Fictional other','2',2026,1,3,'norm','2026-10-01') RETURNING id`)).rows[0].id;
  const foreignComponent = (await pool.query("INSERT INTO components(section_id,name,weight_percent,maximum_score) VALUES ($1,'Decimal',33.33,100) RETURNING id,weight_percent",[other])).rows[0];
  expect(foreignComponent.weight_percent).toBe('33.33');
  await expect(pool.query('INSERT INTO scores(enrollment_id,component_id,section_id,score) VALUES ($1,$2,$3,10)',[enrollmentA,foreignComponent.id,sectionId])).rejects.toMatchObject({code:'23503'});
});

test('pagination uses creation time and UUID without exposing another account', async () => {
  await fixture();
  const other = (await pool.query(`INSERT INTO sections(join_code,course_code,course_name,section_number,academic_year,semester,credits,grading_mode,withdrawal_deadline)
    VALUES ('DEF456','OTHER','Fictional other','2',2026,1,3,'norm','2026-10-01') RETURNING id`)).rows[0].id;
  const second = (await pool.query('INSERT INTO enrollments(student_id,section_id) VALUES ($1,$2) RETURNING id',[aId,other])).rows[0].id;
  await service.withStorageConsent({identity:a},async({client,studentId})=>{
    const firstPage = await listOwnedEnrollments(client,studentId,{limit:1});
    expect(firstPage.items.map(x=>x.id)).toEqual([enrollmentA]);
    const lastPage = await listOwnedEnrollments(client,studentId,{limit:1,cursor:firstPage.nextCursor});
    expect(lastPage.items.map(x=>x.id)).toEqual([second]);
    expect(lastPage.nextCursor).toBeNull();
    await expect(listOwnedEnrollments(client,studentId,{cursor:'invalid'})).rejects.toMatchObject({status:400});
  });
});

test('a deletion failure rolls back all private changes', async () => {
  await fixture();
  await pool.query("CREATE FUNCTION test_reject_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deliberate deletion failure'; END $$");
  await pool.query('CREATE TRIGGER test_delete_guard BEFORE DELETE ON students FOR EACH ROW EXECUTE FUNCTION test_reject_delete()');
  try {
    await expect(service.deleteData({identity:a})).rejects.toBeDefined();
    expect((await service.getConsent({identity:a})).storage).toBe(true);
    expect((await pool.query('SELECT score FROM scores WHERE enrollment_id=$1',[enrollmentA])).rows[0].score).toBe('80');
  } finally {
    await pool.query('DROP TRIGGER test_delete_guard ON students');
    await pool.query('DROP FUNCTION test_reject_delete()');
  }
});
