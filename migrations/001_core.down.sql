\set ON_ERROR_STOP on

BEGIN;

DROP TABLE scores;
DROP TABLE enrollments;
DROP TABLE components;
DROP TABLE sections;
DROP TABLE students;

COMMIT;

\dt public.*
