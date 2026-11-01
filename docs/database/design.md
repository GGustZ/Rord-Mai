# DAT-01: Core database design

Status: Ready for team review.

## Tables

- students: internal student ID and verified LINE user ID.
- sections: shared course information for a semester.
- components: assessment names, weights, and maximum scores.
- enrollments: links a student to a section.
- scores: records an enrollment's result for one component.

## Relationships

- A student can have many enrollments.
- A section can have many enrollments.
- A section can have many components.
- An enrollment can have many scores.
- A component can have scores from many enrollments.

## Integrity rules

- A LINE user ID identifies at most one student.
- A join code identifies at most one section.
- A student cannot enroll in the same section twice.
- An enrollment can have at most one score per component.
- Scores must connect enrollments and components from the same section.
- Scores cannot be negative.
- Missing score records mean unrecorded, not zero.
- Deleting a student deletes their enrollments and scores.
- Deleting a student does not delete shared sections.
- Deleting a section with enrollments is rejected.

## Type choices

- UUID for internal identifiers.
- DATE for withdrawal deadlines.
- TIMESTAMPTZ for creation and update times.
- NUMERIC for scores and percentages.
- INTEGER for academic year, semester, and credits.

## Later migrations and application rules

- Consent storage and checks: PRV-01.
- Academic profiles: DAT-05.
- Attendance: DAT-07.
- Repeated-course information: DAT-08.
- Complete account-deletion behavior: DAT-10.
- Section creation must save all components in one transaction.
- Component count and total weight must be checked before saving.
- Grade thresholds and score upper bounds need additional enforcement.
- Shared grading structures are immutable through the v1 application.
- Database relationships do not authenticate users or authorize requests.

The five-table migration above describes the original foundation, not the current complete schema. The earlier immutability note is superseded: creators may now revise the full set of weights using an expected revision, without changing components or rescaling marks.

## Current physical schema, 1 November 2026

The retained [editable ERD](diagrams/ERD.drawio) and the new report ERD panels were checked against a local PostgreSQL schema with migrations 001-006 applied: **11 application tables plus `schema_migrations`, 89 columns and 15 foreign keys**. The read-only check compared column names, PostgreSQL types, nullability, primary keys, foreign-key definitions and deletion actions; it did not read academic records.

Migration 002 adds storage-consent evidence; 003 adds attendance, profiles, grading revisions, conversation state, private jobs and nullable creator attribution; 004 adds component order. Migration 005 adds the nullable legacy-compatible component input type. Migration 006 renames profile credits to `credits_counted`, adds independent external-explanation consent and optional previous-grade metadata, and introduces persisted deadline notifications. Stored previous-grade metadata does not implement a repeated-course replacement rule.

Use [Figure 2: core ERD](../diagrams/exports/02-core-erd.svg) and [Figure 3: supporting ERD](../diagrams/exports/03-supporting-erd.svg) from the [report diagram pack](../diagrams/rord-mai-diagrams.html). They split the physical model for readability; repeated students/sections anchors in the supporting panel refer to existing core entities. `schema_migrations` is a technical table with no student relationship. The earlier diagram image is retained as an existing artifact; the new dated report exports are the report reference.

Chat reuses conversation_state and private_jobs without a new migration. All private records cascade on student deletion; sections and revisions preserve shared grading structure with creator/actor attribution cleared. Upper mark bounds, complete weight totals, ownership and writer/withdrawal transactions are enforced by the application and covered by integration tests. See `privacy-lifecycle.md` and `../development/interfaces.md`.
