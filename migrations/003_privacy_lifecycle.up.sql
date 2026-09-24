BEGIN;
ALTER TABLE enrollments ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE sections
  ADD COLUMN creator_id UUID REFERENCES students(id) ON DELETE SET NULL,
  ADD COLUMN structure_revision INTEGER NOT NULL DEFAULT 1 CHECK (structure_revision > 0);
CREATE INDEX sections_creator_idx ON sections(creator_id);
CREATE TABLE grading_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 1),
  actor_id UUID REFERENCES students(id) ON DELETE SET NULL,
  previous_weights JSONB NOT NULL,
  new_weights JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(section_id, revision)
);
CREATE INDEX grading_revisions_actor_idx ON grading_revisions(actor_id);
CREATE TABLE academic_profiles (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  current_gpa NUMERIC NOT NULL CHECK (current_gpa BETWEEN 0 AND 4),
  credits_earned INTEGER NOT NULL CHECK (credits_earned >= 0),
  academic_year INTEGER NOT NULL CHECK (academic_year BETWEEN 1 AND 9999),
  semester INTEGER NOT NULL CHECK (semester IN (1,2,3)),
  CHECK (credits_earned > 0 OR current_gpa = 0)
);
CREATE TABLE attendance (
  enrollment_id UUID NOT NULL,
  component_id UUID NOT NULL,
  section_id UUID NOT NULL,
  attended INTEGER NOT NULL CHECK (attended >= 0),
  total_sessions INTEGER NOT NULL CHECK (total_sessions > 0 AND attended <= total_sessions),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(enrollment_id, component_id),
  FOREIGN KEY(enrollment_id, section_id) REFERENCES enrollments(id, section_id) ON DELETE CASCADE,
  FOREIGN KEY(component_id, section_id) REFERENCES components(id, section_id) ON DELETE RESTRICT
);
CREATE INDEX attendance_component_idx ON attendance(component_id, section_id);
CREATE TABLE conversation_state (
  student_id UUID PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (isfinite(expires_at))
);
CREATE TABLE private_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL CHECK (isfinite(expires_at)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX private_jobs_student_idx ON private_jobs(student_id);
COMMIT;
