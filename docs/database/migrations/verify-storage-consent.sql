\set ON_ERROR_STOP on
BEGIN;
DO $$
DECLARE
    test_id UUID;
    granted_id UUID;
    initial_time TIMESTAMPTZ;
    stored_consent BOOLEAN;
BEGIN
    -- A legacy row has no implied consent after migration.
    INSERT INTO students (line_user_id) VALUES ('prv01-schema-test') RETURNING id INTO test_id;
    SELECT storage_consent INTO stored_consent FROM students WHERE id = test_id;
    IF stored_consent IS DISTINCT FROM FALSE THEN
        RAISE EXCEPTION 'Legacy/default row unexpectedly has consent';
    END IF;

    BEGIN
        UPDATE students SET storage_consent = TRUE WHERE id = test_id;
        RAISE EXCEPTION 'Missing evidence was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE students SET storage_consent = TRUE, storage_policy_version = ' ',
            storage_consented_at = CURRENT_TIMESTAMP WHERE id = test_id;
        RAISE EXCEPTION 'Blank policy was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    BEGIN
        UPDATE students SET storage_consent = TRUE, storage_policy_version = 'v1',
            storage_consented_at = 'infinity' WHERE id = test_id;
        RAISE EXCEPTION 'Infinite timestamp was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    UPDATE students SET storage_consent = TRUE, storage_policy_version = 'v1',
        storage_consented_at = CURRENT_TIMESTAMP WHERE id = test_id;

    BEGIN
        UPDATE students SET storage_consent = FALSE WHERE id = test_id;
        RAISE EXCEPTION 'False consent with stale evidence was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- Explicit grant creates the ID and evidence in one statement.
    INSERT INTO students (line_user_id, storage_consent, storage_policy_version, storage_consented_at)
    VALUES ('prv01-new-grant', TRUE, 'v1', CURRENT_TIMESTAMP)
    RETURNING id, storage_consented_at INTO granted_id, initial_time;
    IF granted_id IS NULL OR initial_time IS NULL THEN
        RAISE EXCEPTION 'Grant did not generate identity and evidence';
    END IF;
END $$;
ROLLBACK;
\echo 'Storage consent schema checks passed; test rows rolled back.'
