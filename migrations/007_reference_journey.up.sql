ALTER TABLE academic_profiles ALTER COLUMN current_gpa DROP NOT NULL;
ALTER TABLE academic_profiles ALTER COLUMN credits_counted DROP NOT NULL;
ALTER TABLE academic_profiles ADD CONSTRAINT academic_profile_baseline_pair
  CHECK ((current_gpa IS NULL) = (credits_counted IS NULL));
ALTER TABLE deadline_notifications ADD COLUMN message_payload JSONB;
