BEGIN;
DROP TABLE deadline_notifications;
ALTER TABLE enrollments DROP COLUMN previous_grade_point;
ALTER TABLE students DROP CONSTRAINT explanation_requires_storage,
  DROP COLUMN explanation_consented_at, DROP COLUMN cross_border_explanation;
ALTER TABLE academic_profiles RENAME COLUMN credits_counted TO credits_earned;
COMMIT;
