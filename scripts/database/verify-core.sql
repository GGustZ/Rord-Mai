\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
    student_a UUID;
    section_a UUID;
    section_b UUID;
    component_a UUID;
    component_b UUID;
    enrollment_a UUID;
BEGIN
    INSERT INTO students (line_user_id)
    VALUES ('dat02-test-' || gen_random_uuid()::TEXT)
    RETURNING id INTO student_a;

    INSERT INTO sections (
        join_code, course_code, course_name, section_number,
        academic_year, semester, credits,
        grading_mode, withdrawal_deadline
    )
    VALUES (
        'TST001', 'WEB101', 'Web Programming', '01',
        2026, 1, 3,
        'norm', DATE '2026-10-30'
    )
    RETURNING id INTO section_a;

    INSERT INTO sections (
        join_code, course_code, course_name, section_number,
        academic_year, semester, credits,
        grading_mode, withdrawal_deadline
    )
    VALUES (
        'TST002', 'MAT101', 'Mathematics', '01',
        2026, 1, 3,
        'norm', DATE '2026-10-30'
    )
    RETURNING id INTO section_b;

    INSERT INTO components (
        section_id, name, weight_percent, maximum_score
    )
    VALUES (section_a, 'Final', 100, 80)
    RETURNING id INTO component_a;

    INSERT INTO components (
        section_id, name, weight_percent, maximum_score
    )
    VALUES (section_b, 'Final', 100, 100)
    RETURNING id INTO component_b;

    INSERT INTO enrollments (student_id, section_id)
    VALUES (student_a, section_a)
    RETURNING id INTO enrollment_a;

    -- Valid recorded zero must be accepted.
    INSERT INTO scores (
        enrollment_id, component_id, section_id, score
    )
    VALUES (enrollment_a, component_a, section_a, 0);

    RAISE NOTICE 'PASS: valid records and recorded zero accepted';

    -- Duplicate enrollment must fail.
    BEGIN
        INSERT INTO enrollments (student_id, section_id)
        VALUES (student_a, section_a);

        RAISE EXCEPTION 'FAIL: duplicate enrollment accepted';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'PASS: duplicate enrollment rejected';
    END;

    -- Duplicate score must fail.
    BEGIN
        INSERT INTO scores (
            enrollment_id, component_id, section_id, score
        )
        VALUES (enrollment_a, component_a, section_a, 20);

        RAISE EXCEPTION 'FAIL: duplicate score accepted';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'PASS: duplicate score rejected';
    END;

    -- Negative score must fail.
    BEGIN
        UPDATE scores
        SET score = -1
        WHERE enrollment_id = enrollment_a
          AND component_id = component_a;

        RAISE EXCEPTION 'FAIL: negative score accepted';
    EXCEPTION
        WHEN check_violation THEN
            RAISE NOTICE 'PASS: negative score rejected';
    END;

    -- Component from another section must fail.
    BEGIN
        INSERT INTO scores (
            enrollment_id, component_id, section_id, score
        )
        VALUES (enrollment_a, component_b, section_a, 20);

        RAISE EXCEPTION 'FAIL: cross-section score accepted';
    EXCEPTION
        WHEN foreign_key_violation THEN
            RAISE NOTICE 'PASS: cross-section score rejected';
    END;

    -- An enrolled section cannot be deleted.
    BEGIN
        DELETE FROM sections WHERE id = section_a;

        RAISE EXCEPTION 'FAIL: enrolled section deleted';
    EXCEPTION
        WHEN restrict_violation OR foreign_key_violation THEN
            RAISE NOTICE 'PASS: enrolled section deletion rejected';
    END;

    -- Deleting a student removes their private records.
    DELETE FROM students WHERE id = student_a;

    IF EXISTS (
        SELECT 1 FROM enrollments WHERE id = enrollment_a
    ) OR EXISTS (
        SELECT 1 FROM scores WHERE enrollment_id = enrollment_a
    ) THEN
        RAISE EXCEPTION 'FAIL: private records were left behind';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM sections WHERE id = section_a
    ) THEN
        RAISE EXCEPTION 'FAIL: shared section was deleted';
    END IF;

    RAISE NOTICE 'PASS: student deletion removes private records and preserves section';
END;
$$;

-- Verification leaves the database without test records.
ROLLBACK;
