\set ON_ERROR_STOP on
-- Development rollback only: this removes consent evidence.
-- Stop all writers before rollback; never silently downgrade a live service.
BEGIN;
ALTER TABLE students
    DROP CONSTRAINT students_storage_consent_evidence,
    DROP COLUMN storage_consented_at,
    DROP COLUMN storage_policy_version,
    DROP COLUMN storage_consent;
COMMIT;
