'use strict';
const { fail } = require('../lib/errors');
const requireOwnedEnrollment = async (client, studentId, enrollmentId) => {
  const { rows } = await client.query(
    'SELECT id, section_id, target_grade FROM enrollments WHERE id = $1 AND student_id = $2',
    [enrollmentId, studentId]);
  if (!rows[0]) throw fail('RESOURCE_NOT_FOUND');
  return rows[0];
};
const parseCursor = (cursor) => {
  if (!cursor) return [null, null];
  try {
    if (typeof cursor !== 'string' || cursor.length > 256) throw Error();
    const [time, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof time !== 'string' || !Number.isFinite(Date.parse(time)) ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) throw Error();
    return [time, id];
  } catch { throw fail('VALIDATION_ERROR'); }
};
const listOwnedEnrollments = async (client, studentId, { limit = 20, cursor = null } = {}) => {
  const [afterTime, afterId] = parseCursor(cursor);
  const { rows } = await client.query(
    'SELECT id, section_id, target_grade, created_at::text AS cursor_time FROM enrollments WHERE student_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) > ($2::timestamptz, $3::uuid)) ORDER BY created_at, id LIMIT $4',
    [studentId, afterTime, afterId, limit + 1]);
  return { items: rows.slice(0, limit).map((row) => ({
    id: row.id, sectionId: row.section_id, targetGrade: row.target_grade, repeat: null,
  })), nextCursor: rows.length > limit ? Buffer.from(JSON.stringify([rows[limit - 1].cursor_time, rows[limit - 1].id])).toString('base64url') : null };
};
// Call only inside withStorageConsent. A queued job must retain the original student UUID;
// resolving only a LINE user ID could revive stale work after deletion and a fresh grant.
const requireCurrentJob = async (client, studentId, jobId) => {
  const { rows } = await client.query(
    'SELECT id, kind, payload FROM private_jobs WHERE id = $1 AND student_id = $2 AND expires_at > CURRENT_TIMESTAMP FOR UPDATE',
    [jobId, studentId]);
  if (!rows[0]) throw fail('RESOURCE_NOT_FOUND');
  return rows[0];
};
module.exports = { requireOwnedEnrollment, listOwnedEnrollments, requireCurrentJob, parseCursor };
