\set ON_ERROR_STOP on

BEGIN;

-- 1. Students
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    line_user_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT students_line_user_id_unique
        UNIQUE (line_user_id),

    CONSTRAINT students_line_user_id_not_blank
        CHECK (btrim(line_user_id) <> '')
);


-- 2. Sections
CREATE TABLE sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    join_code VARCHAR(6) NOT NULL,
    course_code VARCHAR(30) NOT NULL,
    course_name VARCHAR(200) NOT NULL,
    section_number VARCHAR(20) NOT NULL,

    academic_year INTEGER NOT NULL,
    semester INTEGER NOT NULL,
    credits INTEGER NOT NULL,

    grading_mode TEXT NOT NULL,
    withdrawal_deadline DATE NOT NULL,

    a_min NUMERIC,
    b_plus_min NUMERIC,
    b_min NUMERIC,
    c_plus_min NUMERIC,
    c_min NUMERIC,
    d_plus_min NUMERIC,
    d_min NUMERIC,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT sections_join_code_unique
        UNIQUE (join_code),

    CONSTRAINT sections_join_code_format
        CHECK (join_code ~ '^[A-Z0-9]{6}$'),

    CONSTRAINT sections_course_code_not_blank
        CHECK (btrim(course_code) <> ''),

    CONSTRAINT sections_course_name_not_blank
        CHECK (btrim(course_name) <> ''),

    CONSTRAINT sections_number_not_blank
        CHECK (btrim(section_number) <> ''),

    CONSTRAINT sections_academic_year_range
        CHECK (academic_year BETWEEN 1 AND 9999),

    CONSTRAINT sections_semester_range
        CHECK (semester IN (1, 2, 3)),

    CONSTRAINT sections_credits_positive
        CHECK (credits > 0),

    CONSTRAINT sections_grading_mode_valid
        CHECK (grading_mode IN ('criterion', 'norm')),

    CONSTRAINT sections_deadline_finite
        CHECK (isfinite(withdrawal_deadline)),

    -- Criterion: all thresholds must exist.
    -- Norm: all thresholds must be NULL.
    CONSTRAINT sections_threshold_presence
        CHECK (
            (
                grading_mode = 'criterion'
                AND a_min IS NOT NULL
                AND b_plus_min IS NOT NULL
                AND b_min IS NOT NULL
                AND c_plus_min IS NOT NULL
                AND c_min IS NOT NULL
                AND d_plus_min IS NOT NULL
                AND d_min IS NOT NULL
            )
            OR
            (
                grading_mode = 'norm'
                AND a_min IS NULL
                AND b_plus_min IS NULL
                AND b_min IS NULL
                AND c_plus_min IS NULL
                AND c_min IS NULL
                AND d_plus_min IS NULL
                AND d_min IS NULL
            )
        ),

    -- Strict ordering plus the end bounds keeps every
    -- criterion threshold within 0..100.
    CONSTRAINT sections_threshold_order
        CHECK (
            grading_mode = 'norm'
            OR (
                a_min <= 100
                AND a_min > b_plus_min
                AND b_plus_min > b_min
                AND b_min > c_plus_min
                AND c_plus_min > c_min
                AND c_min > d_plus_min
                AND d_plus_min > d_min
                AND d_min >= 0
            )
        )
);


-- 3. Components
CREATE TABLE components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    section_id UUID NOT NULL,
    name VARCHAR(100) NOT NULL,
    weight_percent NUMERIC NOT NULL,
    maximum_score NUMERIC NOT NULL,

    -- Supports the composite foreign key from scores.
    CONSTRAINT components_id_section_unique
        UNIQUE (id, section_id),

    CONSTRAINT components_section_fk
        FOREIGN KEY (section_id)
        REFERENCES sections (id)
        ON DELETE CASCADE,

    CONSTRAINT components_name_not_blank
        CHECK (btrim(name) <> ''),

    CONSTRAINT components_weight_valid
        CHECK (
            weight_percent > 0
            AND weight_percent <= 100
            AND weight_percent = round(weight_percent, 2)
        ),

    CONSTRAINT components_maximum_score_valid
        CHECK (
            maximum_score > 0
            AND maximum_score < 'Infinity'::NUMERIC
        )
);


-- 4. Enrollments
CREATE TABLE enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    student_id UUID NOT NULL,
    section_id UUID NOT NULL,
    target_grade TEXT,

    CONSTRAINT enrollments_student_section_unique
        UNIQUE (student_id, section_id),

    -- Supports the composite foreign key from scores.
    CONSTRAINT enrollments_id_section_unique
        UNIQUE (id, section_id),

    CONSTRAINT enrollments_student_fk
        FOREIGN KEY (student_id)
        REFERENCES students (id)
        ON DELETE CASCADE,

    -- Do not delete a section while students are enrolled.
    CONSTRAINT enrollments_section_fk
        FOREIGN KEY (section_id)
        REFERENCES sections (id)
        ON DELETE RESTRICT,

    CONSTRAINT enrollments_target_grade_valid
        CHECK (
            target_grade IS NULL
            OR target_grade IN ('A', 'B+', 'B', 'C+', 'C', 'D+', 'D')
        )
);


-- 5. Scores
CREATE TABLE scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    enrollment_id UUID NOT NULL,
    component_id UUID NOT NULL,
    section_id UUID NOT NULL,

    score NUMERIC NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT scores_enrollment_component_unique
        UNIQUE (enrollment_id, component_id),

    -- Both references share the same section_id.
    -- This prevents mixing enrollments and components
    -- from different sections.
    CONSTRAINT scores_enrollment_section_fk
        FOREIGN KEY (enrollment_id, section_id)
        REFERENCES enrollments (id, section_id)
        ON DELETE CASCADE,

    CONSTRAINT scores_component_section_fk
        FOREIGN KEY (component_id, section_id)
        REFERENCES components (id, section_id)
        ON DELETE RESTRICT,

    CONSTRAINT scores_value_valid
        CHECK (
            score >= 0
            AND score < 'Infinity'::NUMERIC
        )
);


-- Index foreign-key lookup paths not already covered
-- by the leading columns of a primary/unique index.
CREATE INDEX components_section_idx
    ON components (section_id);

CREATE INDEX enrollments_section_idx
    ON enrollments (section_id);

CREATE INDEX scores_component_section_idx
    ON scores (component_id, section_id);

COMMIT;

\dt public.*
