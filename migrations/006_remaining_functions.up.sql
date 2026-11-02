BEGIN;
ALTER TABLE academic_profiles RENAME COLUMN credits_earned TO credits_counted;
ALTER TABLE students
  ADD COLUMN cross_border_explanation BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN explanation_consented_at TIMESTAMPTZ,
  ADD CONSTRAINT explanation_requires_storage CHECK (NOT cross_border_explanation OR storage_consent);
ALTER TABLE enrollments ADD COLUMN previous_grade_point NUMERIC
  CHECK (previous_grade_point IN (0,1,1.5,2,2.5,3,3.5,4));
CREATE TABLE deadline_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  retry_key UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (student_id, section_id)
);
COMMIT;
