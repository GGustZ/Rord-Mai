BEGIN;
DROP INDEX enrollments_student_created_idx;
ALTER TABLE components DROP COLUMN position;
COMMIT;

