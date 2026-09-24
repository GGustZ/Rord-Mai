BEGIN;
ALTER TABLE enrollments DROP COLUMN created_at;
DROP TABLE private_jobs, conversation_state, attendance, academic_profiles, grading_revisions;
ALTER TABLE sections DROP COLUMN creator_id, DROP COLUMN structure_revision;
COMMIT;
