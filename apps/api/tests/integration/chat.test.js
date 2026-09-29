const { Pool } = require('pg');
const { randomUUID, createHmac } = require('node:crypto');
const request = require('supertest');
const { migrate } = require('../../src/db/migrate');
const { createConsentService } = require('../../src/services/consent-service');
const { createAcademicService } = require('../../src/services/academic-service');
const { createChatService, JOB_MS } = require('../../src/services/chat-service');
const { createApp } = require('../../src/app');
const url = process.env.TEST_DATABASE_URL;
if (!url || !/\/rordmai_test(?:\?|$)/.test(url)) throw Error('Use disposable rordmai_test.');
const pool = new Pool({ connectionString: url, max: 8, statement_timeout: 8000 });
const consent = createConsentService({ pool, currentPolicyVersion: 'v1' });
const academic = createAcademicService({ consentService: consent });
const a = { lineUserId: 'U' + 'a'.repeat(32) }, b = { lineUserId: 'U' + 'b'.repeat(32) };
const grant = identity => consent.grantStorageConsent({ identity, accepted: true, policyVersion: 'v1' });
const input = () => ({ courseCode: 'TEST', courseName: 'Fictional mathematics', sectionNumber: '1', academicYear: 2026, semester: 1, credits: 3,
  gradingMode: 'criterion', withdrawalDeadline: '2026-10-15', gradeThresholds: { A: 80, 'B+': 75, B: 70, 'C+': 65, C: 60, 'D+': 55, D: 50 },
  components: [{ name: 'Midterm', weightPercent: 40, maximumScore: 100,inputType:'marks' }, { name: 'Final', weightPercent: 60, maximumScore: 100,inputType:'marks' }] });
let chat, messaging, created, joined, sequence;
const event = (text, identity = a) => ({ type: 'message', message: { type: 'text', text }, source: { type: 'user', userId: identity.lineUserId },
  timestamp: Date.now() + ++sequence, webhookEventId: randomUUID(), replyToken: randomUUID() });
const makeChat = () => createChatService({ pool, consentService: consent, messaging, liffId: '123-test' });
const send = async (text, identity = a) => { const e = event(text, identity); await chat.accept(e); await chat.drain(); return e; };
const draft = async (score = '80', identity = a) => { for (const text of ['score', '1', '1', score]) await send(text, identity); };
const lastReply = () => messaging.reply.mock.calls.at(-1)?.[1];
const detail = (identity = a, enrollmentId = created.enrollment.id) => academic.detail({ identity, enrollmentId });
beforeAll(async () => { await migrate(pool); });
afterAll(async () => { await pool.end(); });
beforeEach(async () => {
  sequence = 0;
  await pool.query('TRUNCATE students,sections CASCADE');
  await grant(a); await grant(b);
  created = await academic.createSection({ identity: a, input: input() });
  joined = await academic.joinSection({ identity: b, code: created.section.joinCode });
  messaging = { reply: jest.fn().mockResolvedValue(undefined) };
  chat = makeChat();
});
afterEach(async () => { await chat.stop(); });

test('CHAT-001/004, HOOK-006: confirm through shared writer once; private jobs scrub processed payloads', async () => {
  await draft();
  expect((await detail()).scores).toEqual([]);
  const confirmation = await send('confirm');
  expect((await detail()).scores[0].score).toBe(80);
  expect(lastReply()).toContain('32.00 weighted points');
  const saved = (await detail()).scores[0];
  await chat.accept(confirmation); await chat.drain();
  expect((await detail()).scores[0]).toEqual(saved);
  expect((await pool.query("SELECT payload FROM private_jobs WHERE kind='line.done'")).rows.every(r => Object.keys(r.payload).length === 0)).toBe(true);
});
test('CHAT-002/005: invalid marks recover; edited zero is saved only after confirmation', async () => {
  await draft('101'); expect(lastReply()).toContain('0 to 100');
  await send('80'); await send('edit'); await send('0'); await send('confirm');
  expect((await detail()).scores[0].score).toBe(0);
});
test('CHAT-003/010: cancel and unsolicited numbers never guess a score write', async () => {
  await draft(); await send('cancel'); await send('confirm'); await send('75');
  expect((await detail()).scores).toEqual([]);
  expect(lastReply()).toContain('No active draft');
});
test('CHAT-007: expired conversation rejects late confirmation', async () => {
  await draft();
  await pool.query("UPDATE conversation_state SET expires_at=CURRENT_TIMESTAMP-interval '1 second'");
  await send('confirm'); expect((await detail()).scores).toEqual([]);
  expect(lastReply()).toContain('expired');
});
test('QUEUE-002: new worker resumes accepted confirmation without a second mutation', async () => {
  await draft(); const e = event('confirm'); await chat.accept(e);
  chat = makeChat(); await chat.drain();
  expect((await detail()).scores[0].score).toBe(80);
  await chat.drain(); expect(messaging.reply.mock.calls.filter(x => x[1].startsWith('Saved'))).toHaveLength(1);
});
test('QUEUE-003: pre-consent content persists neither student nor job nor conversation', async () => {
  await consent.deleteData({ identity: a });
  await send('my score is 83');
  expect(lastReply()).toContain('accept storage consent');
  for (const table of ['private_jobs', 'conversation_state']) expect((await pool.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
  expect((await pool.query('SELECT 1 FROM students WHERE line_user_id=$1', [a.lineUserId])).rows).toEqual([]);
});
test('QUEUE-007: withdrawal removes pending confirmation and cannot revive it after regrant', async () => {
  await draft(); const pending = event('confirm'); await chat.accept(pending);
  await consent.deleteData({ identity: a }); await grant(a); await chat.drain();
  expect((await pool.query('SELECT * FROM scores')).rows).toEqual([]);
  expect((await pool.query('SELECT * FROM private_jobs')).rows).toEqual([]);
  // Provider timestamp predates this fresh grant.
  await chat.accept({ ...pending, timestamp: Date.now() - 1000 }); await chat.drain();
  expect((await pool.query('SELECT * FROM private_jobs')).rows).toEqual([]);
  expect((await academic.detail({ identity: b, enrollmentId: joined.id })).section.id).toBe(created.section.id);
});
test('expired queued confirmation and stale webhook cannot save marks', async () => {
  await draft(); await chat.accept(event('confirm'));
  await pool.query("UPDATE private_jobs SET expires_at=CURRENT_TIMESTAMP-interval '1 second'");
  await chat.drain();
  await chat.accept({ ...event('confirm'), timestamp: Date.now() - JOB_MS - 1 });
  await chat.drain(); expect((await detail()).scores).toEqual([]);
  expect((await pool.query('SELECT * FROM private_jobs')).rows).toEqual([]);
});
test('CHAT-009: interleaved accounts keep drafts and confirmed marks independent', async () => {
  for (const text of ['score', '1', '1']) { await send(text, a); await send(text, b); }
  await send('80', a); await send('60', b); await send('confirm', b); await send('confirm', a);
  expect((await detail()).scores[0].score).toBe(80);
  expect((await detail(b, joined.id)).scores[0].score).toBe(60);
});
test('CHAT-011: weight revision during draft requires review before any save', async () => {
  await draft();
  await academic.reviseWeights({ identity: a, sectionId: created.section.id, input: { expectedRevision: 1,
    components: created.section.components.map((c, i) => ({ id: c.id, weightPercent: i ? 70 : 30 })) } });
  await send('confirm'); expect(lastReply()).toContain('changed'); expect((await detail()).scores).toEqual([]);
});
test('a LIFF correction after chat selection is never overwritten by the old draft', async () => {
  await draft();
  await academic.writeComponent({ identity: a, enrollmentId: created.enrollment.id, componentId: created.section.components[0].id, kind: 'score', input: { score: 25 } });
  await send('confirm'); expect(lastReply()).toContain('changed'); expect((await detail()).scores[0].score).toBe(25);
});
test('CHAT-006: deleted enrollment cancels stale selection without a write', async () => {
  await send('score');
  await pool.query('DELETE FROM enrollments WHERE id=$1', [created.enrollment.id]);
  await send('1'); expect(lastReply()).toContain('restart'); expect((await pool.query('SELECT * FROM scores')).rows).toEqual([]);
});
test('CHAT-008: later pages expose all courses and assessments', async () => {
  for (let i = 0; i < 8; i++) await academic.createSection({ identity: a, input: { ...input(), courseCode: 'PAGE' + i } });
  await send('score'); expect(lastReply()).toContain('next'); await send('next'); expect(lastReply()).toContain('PAGE7');
  const many = await academic.createSection({ identity: b, input: { ...input(), components: Array.from({ length: 10 }, (_, i) => ({ name: 'Part ' + (i + 1), weightPercent: 10, maximumScore: 100,inputType:'marks' })) } });
  await send('score', b); await send('2', b); await send('next', b); expect(lastReply()).toContain('Part 10');
  await send('2', b); await send('30', b); await send('confirm', b);
  expect((await detail(b, many.enrollment.id)).scores[0].componentId).toBe(many.section.components[9].id);
});
test('HOOK-005: groups and non-text events are ignored without private replies', async () => {
  await chat.accept({ ...event('score'), source: { type: 'group', userId: a.lineUserId, groupId: 'group' } });
  await chat.accept({ ...event('score'), type: 'follow' });
  await chat.drain(); expect(messaging.reply).not.toHaveBeenCalled();
  expect((await pool.query('SELECT * FROM private_jobs')).rows).toEqual([]);
});
test('older out-of-order message cannot change a newer draft', async () => {
  await draft('60'); const delayed = { ...event('99'), timestamp: Date.now() - 1000 };
  // Keep event eligible but explicitly older than the current conversation.
  await pool.query("UPDATE students SET storage_consented_at=CURRENT_TIMESTAMP-interval '1 minute'");
  await chat.accept(delayed); await chat.drain(); expect(lastReply()).toContain('older message');
  await send('confirm'); expect((await detail()).scores[0].score).toBe(60);
});
test('QUEUE-004/005: reply failure preserves saved score, sanitizes logs and never pushes', async () => {
  await draft(); messaging.reply.mockRejectedValue(Error('SECRET-TOKEN, marks=80'));
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  try {
    const e = await send('confirm');
    expect((await detail()).scores[0].score).toBe(80);
    expect((await pool.query('SELECT kind,payload FROM private_jobs WHERE event_id=$1', [e.webhookEventId])).rows[0])
      .toEqual({ kind: 'line.failed', payload: {} });
    expect(log.mock.calls.flat().join(' ')).not.toMatch(/SECRET|80/);
    const count = messaging.reply.mock.calls.length; await chat.drain(); expect(messaging.reply).toHaveBeenCalledTimes(count);
  } finally { log.mockRestore(); }
});
test('chat summaries reflect LIFF scores, targets and norm limitations', async () => {
  await academic.writeComponent({ identity: a, enrollmentId: created.enrollment.id, componentId: created.section.components[0].id, kind: 'score', input: { score: 80 } });
  await academic.updateTarget({ identity: a, enrollmentId: created.enrollment.id, input: { targetGrade: 'A' } });
  await send('summary'); await send('1'); expect(lastReply()).toContain('32.00'); expect(lastReply()).toContain('80.00%');
  await academic.createSection({ identity: a, input: { ...input(), gradingMode: 'norm', gradeThresholds: null } });
  await send('summary'); await send('2'); expect(lastReply()).toContain('Norm grading');
});
test('attendance source remains protected through chat', async () => {
  await pool.query('INSERT INTO attendance(enrollment_id,component_id,section_id,attended,total_sessions) VALUES ($1,$2,$3,1,2)',[created.enrollment.id,created.section.components[0].id,created.section.id]);
  await send('score'); await send('1'); await send('1'); expect(lastReply()).toContain('attendance');
  expect((await detail()).scores).toEqual([]);
});
test('attendance assessments without entries direct to LIFF; names do not determine type', async () => {
  await academic.reviseWeights({identity:a,sectionId:created.section.id,input:{expectedRevision:1,components:created.section.components.map((c,i)=>({id:c.id,weightPercent:c.weightPercent,inputType:i?'marks':'attendance'}))}});
  await send('score');await send('1');await send('1');expect(lastReply()).toContain('attended sessions');expect(lastReply()).toContain('https://liff.line.me/123-test');
  await send('80');await send('confirm');expect((await detail()).scores).toEqual([]);
});
test('unclassified course and a reclassified chat draft cannot accept marks', async () => {
  await pool.query('UPDATE components SET input_type=NULL WHERE id=$1',[created.section.components[1].id]);
  await send('score');await send('1');await send('1');expect(lastReply()).toContain('creator must confirm assessment types');
  await academic.reviseWeights({identity:a,sectionId:created.section.id,input:{expectedRevision:1,components:created.section.components.map(c=>({id:c.id,weightPercent:c.weightPercent,inputType:'marks'}))}});
  await draft();
  await academic.reviseWeights({identity:a,sectionId:created.section.id,input:{expectedRevision:2,components:created.section.components.map((c,i)=>({id:c.id,weightPercent:c.weightPercent,inputType:i?'marks':'attendance'}))}});
  await send('confirm');expect(lastReply()).toContain('changed');expect((await detail()).scores).toEqual([]);
});
test('QUEUE-001: signed HTTP receipt acknowledges durable job without downstream processing', async () => {
  const secret = 'test-secret', e = event('score');
  const app = createApp({ lineWebhook: { secret, chatService: { accept: chat.accept, wake: () => {} } } });
  const body = JSON.stringify({ events: [e] }); const start = performance.now();
  const response = await request(app).post('/webhooks/line').set('Content-Type', 'application/json')
    .set('x-line-signature', createHmac('sha256', secret).update(body).digest('base64')).send(body);
  expect(response.status).toBe(200); expect(performance.now() - start).toBeLessThan(1000);
  expect(messaging.reply).not.toHaveBeenCalled();
  expect((await pool.query('SELECT kind FROM private_jobs WHERE event_id=$1', [e.webhookEventId])).rows[0].kind).toBe('line.pending');
});
test('two workers claiming one confirmation still make only one write and reply', async () => {
  await draft(); await chat.accept(event('confirm'));
  const second = makeChat();
  await Promise.all([chat.drain(), second.drain()]);
  await second.stop();
  expect((await detail()).scores[0].score).toBe(80);
  expect(messaging.reply.mock.calls.filter(x => x[1].startsWith('Saved'))).toHaveLength(1);
});
test('confirmation failure rolls back mutation and survives restart for one successful retry', async () => {
  await draft(); await chat.accept(event('confirm'));
  await pool.query("CREATE FUNCTION test_chat_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'simulated storage failure'; END $$");
  await pool.query('CREATE TRIGGER test_chat_guard BEFORE INSERT ON scores FOR EACH ROW EXECUTE FUNCTION test_chat_fail()');
  try {
    await expect(chat.drain()).rejects.toBeDefined();
    expect((await detail()).scores).toEqual([]);
    expect((await pool.query("SELECT count(*) FROM private_jobs WHERE kind='line.pending'")).rows[0].count).toBe('1');
  } finally {
    await pool.query('DROP TRIGGER test_chat_guard ON scores'); await pool.query('DROP FUNCTION test_chat_fail()');
  }
  chat = makeChat(); await chat.drain(); expect((await detail()).scores[0].score).toBe(80);
});
test('withdrawal waits for an in-flight private reply, then removes the saved score and queued state', async () => {
  await draft();
  let releaseReply, replyStarted;
  const started = new Promise(resolve => { replyStarted = resolve; });
  const paused = new Promise(resolve => { releaseReply = resolve; });
  messaging.reply.mockImplementation(async () => { replyStarted(); await paused; });
  await chat.accept(event('confirm'));
  const processing = chat.drain(); await started;
  const deleting = consent.deleteData({ identity: a });
  try {
    const until = Date.now() + 3000;
    let waiting = false;
    while (!waiting && Date.now() < until) {
      waiting = (await pool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%SELECT id FROM students%'")).rows.length > 0;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
    }
    expect(waiting).toBe(true);
  } finally { releaseReply(); await Promise.all([processing, deleting]); }
  for (const table of ['scores', 'conversation_state', 'private_jobs']) expect((await pool.query(`SELECT * FROM ${table}`)).rows).toEqual([]);
  expect((await detail(b, joined.id)).section.canEdit).toBe(false);
});
test('HOOK-007: a signed batch is durable and duplicate redelivery does not advance the conversation twice', async () => {
  const secret = 'batch-secret';
  const app = createApp({ lineWebhook: { secret, chatService: { accept: chat.accept, wake: () => {} } } });
  const body = JSON.stringify({ events: [event('score'), event('1')] });
  const signature = createHmac('sha256', secret).update(body).digest('base64');
  for (let i = 0; i < 2; i++) expect((await request(app).post('/webhooks/line')
    .set('Content-Type', 'application/json').set('x-line-signature', signature).send(body)).status).toBe(200);
  expect((await pool.query('SELECT count(*) FROM private_jobs')).rows[0].count).toBe('2');
  await chat.drain(); expect(lastReply()).toContain('Choose an assessment');
  expect(messaging.reply).toHaveBeenCalledTimes(2);
});
