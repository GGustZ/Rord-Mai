BEGIN;
ALTER TABLE components ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK (position >= 0);
CREATE INDEX enrollments_student_created_idx ON enrollments(student_id, created_at, id);
COMMIT;

