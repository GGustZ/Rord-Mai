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

The five-table migration is a foundation, not the complete feature schema.
