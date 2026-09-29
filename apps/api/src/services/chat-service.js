'use strict';
const { createAcademicService } = require('./academic-service');
const { listOwnedEnrollments, requireCurrentJob } = require('../repositories/academic-repository');
const { messages } = require('../lib/errors');
const JOB_MS = 5 * 60 * 1000;
const DRAFT_MS = 15 * 60 * 1000;
const PAGE_SIZE = 8;

const createChatService = ({ pool, consentService, messaging, liffId, now = Date.now }) => {
  const appUrl = 'https://liff.line.me/' + liffId;
  const help = 'Send score to enter marks, summary to view results, or cancel to discard a draft. Courses and consent: ' + appUrl;
  const reply = async (token, text) => {
    try { await messaging.reply(token, text); return true; }
    catch { console.error('LINE reply failed; no push fallback.'); return false; }
  };

  const accept = async (event) => {
    // Academic conversations are private: never answer in group or room chats.
    if (event?.source?.type !== 'user' || event.type !== 'message' || event.message?.type !== 'text') return;
    if (typeof event.source.userId !== 'string' || !/^U[0-9a-f]{32}$/i.test(event.source.userId) ||
        typeof event.webhookEventId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(event.webhookEventId) ||
        typeof event.replyToken !== 'string' || !/^[A-Za-z0-9_-]{1,256}$/.test(event.replyToken) ||
        typeof event.message.text !== 'string' || !Number.isSafeInteger(event.timestamp)) return;
    if (event.timestamp <= now() - JOB_MS || event.timestamp > now() + 30000) return;
    const identity = { lineUserId: event.source.userId };
    try {
      await consentService.withStorageConsent({ identity }, async ({ client, studentId }) => {
        const student = (await client.query('SELECT storage_consented_at FROM students WHERE id=$1', [studentId])).rows[0];
        // Old redeliveries cannot become new work after withdrawal and a fresh grant.
        if (event.timestamp < new Date(student.storage_consented_at).getTime()) return;
        const text = event.message.text.trim();
        const payload = { text: text.length > 100 ? 'help' : text, timestamp: event.timestamp, replyToken: event.replyToken };
        await client.query(`INSERT INTO private_jobs(student_id,event_id,kind,payload,expires_at)
          VALUES ($1,$2,'line.pending',$3,$4) ON CONFLICT(event_id) DO NOTHING`,
        [studentId, event.webhookEventId, JSON.stringify(payload), new Date(Math.min(event.timestamp, now()) + JOB_MS)]);
      });
    } catch (error) {
      if (error.code !== 'STORAGE_CONSENT_REQUIRED') throw error;
      // No identity, text, token or job is persisted before consent.
      await reply(event.replyToken, 'Open Rord-Mai and accept storage consent before entering scores: ' + appUrl);
    }
  };

  const step = async (ctx, state, text) => {
    const { client, studentId } = ctx;
    // Reuse every academic operation in this existing consent-locked transaction.
    // This adapter is internal, never accepted from HTTP or webhook payloads.
    const academic = createAcademicService({ consentService: { withStorageConsent: async (_args, work) => work(ctx) } });
    const command = text.toLowerCase();
    const result = (state, text) => ({ state, text });
    const sections = async (mode, cursor = null) => {
      const page = await listOwnedEnrollments(client, studentId, { limit: PAGE_SIZE, cursor });
      if (!page.items.length) return result({}, 'No courses yet. Create or join a course in LIFF: ' + appUrl);
      const lines = [];
      for (const [i, item] of page.items.entries()) {
        const { section } = await academic.detail({ enrollmentId: item.id });
        lines.push(`${i + 1}. ${section.courseCode} ${section.courseName} (section ${section.sectionNumber})`);
      }
      return result({ phase: 'section', mode, items: page.items.map(x => x.id), nextCursor: page.nextCursor },
        'Choose a course by number:\n' + lines.join('\n') + (page.nextCursor ? '\nSend next for more.' : '') + '\nSend cancel to stop.');
    };
    const components = async (enrollmentId, offset = 0) => {
      const { section } = await academic.detail({ enrollmentId });
      const page = section.components.slice(offset, offset + PAGE_SIZE);
      return result({ phase: 'component', enrollmentId, offset, items: page.map(c => c.id) },
        'Choose an assessment by number:\n' + page.map((c, i) => `${i + 1}. ${c.name} (${c.inputType==='attendance'?'attendance in LIFF':!c.inputType?'type confirmation needed':`max ${c.maximumScore}`})`).join('\n') +
        (offset + PAGE_SIZE < section.components.length ? '\nSend next for more.' : '') + '\nSend cancel to stop.');
    };
    if (command === 'cancel') return result({}, 'Draft cancelled. Confirmed scores are unchanged.');
    if (['score', 'start'].includes(command)) return sections('score');
    if (command === 'summary') return sections('summary');
    if (['help', 'courses'].includes(command)) return result(state, help);
    if (!state.phase) return result({}, 'No active draft (it may have expired). ' + help);
    const choice = /^[1-8]$/.test(text) ? Number(text) - 1 : -1;
    if (state.phase === 'section') {
      if (command === 'next' && state.nextCursor) return sections(state.mode, state.nextCursor);
      const enrollmentId = state.items[choice];
      if (!enrollmentId) return result(state, 'Choose a listed number, next if available, or cancel.');
      if (state.mode === 'score') return components(enrollmentId);
      const detail = await academic.detail({ enrollmentId });
      const summary = await academic.summary({ enrollmentId });
      let response = `${detail.section.courseCode}: ${summary.currentWeightedScore.toFixed(2)} weighted points. Revision ${summary.structureRevision}.`;
      response += detail.section.gradingMode === 'norm' ? '\nNorm grading: no predicted letter grade.' :
        summary.projectedGrade ? '\nGrade: ' + summary.projectedGrade : '\nIncomplete assessments: no predicted grade.';
      if (detail.enrollment.targetGrade) {
        const target = await academic.summary({ enrollmentId, targetGrade: detail.enrollment.targetGrade });
        response += `\nTarget ${detail.enrollment.targetGrade}: ` + (target.requiredRemainingPercent === null ?
          'no remaining assessments.' : `${target.requiredRemainingPercent.toFixed(2)}% required on remaining weight.`);
      }
      return result({}, response + '\nReview or correct scores: ' + appUrl);
    }
    if (state.phase === 'component') {
      const detail = await academic.detail({ enrollmentId: state.enrollmentId });
      if (command === 'next' && state.offset + PAGE_SIZE < detail.section.components.length) {
        return components(state.enrollmentId, state.offset + PAGE_SIZE);
      }
      const componentId = state.items[choice];
      const component = detail.section.components.find(c => c.id === componentId);
      if (!component) return result(state, 'Choose a listed assessment number, next if available, or cancel.');
      if (detail.section.components.some(c => !c.inputType)) {
        return result({}, 'The section creator must confirm assessment types before new entries can be saved. Open LIFF: ' + appUrl);
      }
      if (component.inputType === 'attendance') {
        return result({}, 'Record attended sessions and total sessions for this assessment in LIFF: ' + appUrl);
      }
      if (detail.attendance.some(a => a.componentId === componentId)) {
        return result({}, 'This marks assessment has an old attendance entry. Its result is preserved. Clear that entry in LIFF before entering the real marks: ' + appUrl);
      }
      const existing = detail.scores.find(s => s.componentId === componentId);
      return result({ phase: 'score', enrollmentId: state.enrollmentId, componentId,
        revision: detail.section.structureRevision, previousScore: existing?.score ?? null,
        previousUpdatedAt: existing ? new Date(existing.updatedAt).toISOString() : null },
      `${component.name}: enter marks from 0 to ${component.maximumScore}.` + (existing ? ` Current marks: ${existing.score}.` : '') + '\nSend cancel to stop.');
    }
    const detail = await academic.detail({ enrollmentId: state.enrollmentId });
    const component = detail.section.components.find(c => c.id === state.componentId);
    const existing = detail.scores.find(s => s.componentId === state.componentId);
    const updatedAt = existing ? new Date(existing.updatedAt).toISOString() : null;
    if (!component || detail.section.structureRevision !== state.revision || updatedAt !== state.previousUpdatedAt ||
        (existing?.score ?? null) !== state.previousScore) {
      return result({}, 'The assessment or score changed while you were entering marks. Send score to review it again.');
    }
    if (state.phase === 'confirm' && command === 'edit') return result({ ...state, phase: 'score' }, `Enter replacement marks from 0 to ${component.maximumScore}.`);
    if (state.phase === 'confirm' && command === 'confirm') {
      await academic.writeComponent({ enrollmentId: state.enrollmentId, componentId: state.componentId, kind: 'score', input: { score: state.score } });
      const summary = await academic.summary({ enrollmentId: state.enrollmentId });
      return result({}, `Saved ${state.score}/${component.maximumScore} for ${component.name}.\n${summary.currentWeightedScore.toFixed(2)} weighted points (revision ${summary.structureRevision}).\nCheck your saved scores: ${appUrl}`);
    }
    if (state.phase === 'confirm') return result(state, 'Send confirm to save, edit to change the draft, or cancel.');
    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) > component.maximumScore) {
      return result(state, `Enter a number from 0 to ${component.maximumScore}, or cancel.`);
    }
    return result({ ...state, phase: 'confirm', score: Number(text) },
      `${detail.section.courseCode}, ${component.name}: ${Number(text)}/${component.maximumScore}.\nSend confirm to save, edit to change, or cancel. Nothing is saved yet.`);
  };

  const processJob = async (candidate) => {
    const identity = { lineUserId: candidate.line_user_id };
    try {
      await consentService.withStorageConsent({ identity }, async (ctx) => {
        const { client, studentId } = ctx;
        if (studentId !== candidate.student_id) return;
        const job = await requireCurrentJob(client, studentId, candidate.id);
        if (job.kind !== 'line.pending') return;
        const row = (await client.query('SELECT state FROM conversation_state WHERE student_id=$1 AND expires_at > CURRENT_TIMESTAMP', [studentId])).rows[0];
        const state = row?.state || {};
        let outcome;
        if (job.payload.timestamp < (state.lastTimestamp || 0)) {
          outcome = { state, text: 'An older message arrived late and was ignored. Send score to restart or summary to check saved marks.' };
        } else {
          await client.query('SAVEPOINT chat_step');
          try { outcome = await step(ctx, state, job.payload.text); }
          catch (error) {
            if (!Object.hasOwn(messages, error.code) || error.status >= 500) throw error;
            await client.query('ROLLBACK TO SAVEPOINT chat_step');
            outcome = { state: {}, text: messages[error.code][1] + ' Send score to restart, or open ' + appUrl };
          }
          outcome.state.lastTimestamp = job.payload.timestamp;
        }
        await client.query(`INSERT INTO conversation_state(student_id,state,expires_at) VALUES ($1,$2,$3)
          ON CONFLICT(student_id) DO UPDATE SET state=EXCLUDED.state,expires_at=EXCLUDED.expires_at`,
        [studentId, JSON.stringify(outcome.state), new Date(now() + DRAFT_MS)]);
        await client.query("UPDATE private_jobs SET kind='line.reply',payload=$2 WHERE id=$1",
          [job.id, JSON.stringify({ replyToken: job.payload.replyToken, response: outcome.text })]);
      });
      await consentService.withStorageConsent({ identity }, async ({ client, studentId }) => {
        if (studentId !== candidate.student_id) return;
        const job = await requireCurrentJob(client, studentId, candidate.id);
        if (job.kind !== 'line.reply') return;
        // Keep the student lock during the bounded reply: withdrawal cannot race a private reply.
        // A crash may retry the same single-use LINE reply token, never the academic mutation.
        const delivered = await reply(job.payload.replyToken, job.payload.response);
        await client.query('UPDATE private_jobs SET kind=$2,payload=\'{}\'::jsonb WHERE id=$1',
          [job.id, delivered ? 'line.done' : 'line.failed']);
      });
    } catch (error) {
      if (!['STORAGE_CONSENT_REQUIRED', 'RESOURCE_NOT_FOUND'].includes(error.code)) throw error;
    }
  };

  let running = null, timer, stopped = false;
  const drain = async () => {
    if (running) return running;
    running = (async () => {
      // ponytail: one worker per demo process, batch of 50; shard per student if throughput grows.
      for (let i = 0; i < 50 && !stopped; i++) {
        const candidate = (await pool.query(`SELECT j.id,j.student_id,s.line_user_id FROM private_jobs j
          JOIN students s ON s.id=j.student_id WHERE j.kind IN ('line.pending','line.reply')
          AND j.expires_at > CURRENT_TIMESTAMP ORDER BY j.created_at,j.id LIMIT 1`)).rows[0];
        if (!candidate) break;
        await processJob(candidate);
      }
      await pool.query("DELETE FROM private_jobs WHERE kind LIKE 'line.%' AND expires_at <= CURRENT_TIMESTAMP");
      await pool.query('DELETE FROM conversation_state WHERE expires_at <= CURRENT_TIMESTAMP');
    })();
    try { await running; } finally { running = null; }
  };
  const wake = () => { if (!stopped) drain().catch(() => console.error('Chat processing unavailable; pending work retained until expiry.')); };
  const start = () => { if (!timer) { stopped = false; timer = setInterval(wake, 1000); timer.unref(); wake(); } };
  const stop = async () => { stopped = true; clearInterval(timer); timer = null; if (running) await running.catch(() => {}); };
  return { accept, drain, wake, start, stop };
};

module.exports = { createChatService, JOB_MS, DRAFT_MS };
