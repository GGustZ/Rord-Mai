-- Refuse rollback when it would discard a term-only profile or a queued Flex payload.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM academic_profiles WHERE current_gpa IS NULL)
    OR EXISTS (SELECT 1 FROM deadline_notifications WHERE message_payload IS NOT NULL AND status = 'pending')
  THEN RAISE EXCEPTION 'Complete optional profiles and pending notifications before rollback'; END IF;
END $$;
ALTER TABLE deadline_notifications DROP COLUMN message_payload;
ALTER TABLE academic_profiles DROP CONSTRAINT academic_profile_baseline_pair;
ALTER TABLE academic_profiles ALTER COLUMN current_gpa SET NOT NULL;
ALTER TABLE academic_profiles ALTER COLUMN credits_counted SET NOT NULL;
