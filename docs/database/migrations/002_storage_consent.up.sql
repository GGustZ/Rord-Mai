\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE students
    ADD COLUMN storage_consent BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN storage_policy_version TEXT,
    ADD COLUMN storage_consented_at TIMESTAMPTZ,
    ADD CONSTRAINT students_storage_consent_evidence CHECK (
        (storage_consent = FALSE
            AND storage_policy_version IS NULL
            AND storage_consented_at IS NULL)
        OR
        (storage_consent = TRUE
            AND storage_policy_version IS NOT NULL
            AND btrim(storage_policy_version) <> ''
            AND storage_consented_at IS NOT NULL
            AND isfinite(storage_consented_at))
    );

COMMIT;
