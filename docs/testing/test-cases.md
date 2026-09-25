# Test cases and execution guide

Reviewed against source on 2026-09-21. Related: [project structure and file guide](../project-guide.md), [storage consent](../database/storage-consent.md).

## What belongs in tests?

Yes, `apps/api/tests/` contains executable Jest test-case files. A file is a suite containing one or more cases. A case establishes a starting state, performs an action, and asserts an expected outcome. `test.each` expands one definition into several separately reported cases.

Example: send a two-character join code -> assert HTTP 400 and `VALIDATION_ERROR`. Merely logging the response would not test correctness.

The current suite combines unit tests (plain functions or fake dependencies) and HTTP integration tests (Express plus middleware and routes through Supertest). None of these 46 Jest cases connects to PostgreSQL. The standalone scripts exercise the real database separately. No current test proves the complete authenticated user journey.

## Execution and prerequisites

### Jest suite

From `apps/api`, after installing dependencies:

```powershell
npm.cmd test
```

Run one suite:

```powershell
npm.cmd test -- --runTestsByPath tests/consent-service.test.js
```

No running API server or database is required. Supertest creates temporary listeners. Expected total: 4 suites, 46 cases (20 + 12 + 9 + 5). Multiple assertions within one case do not increase the Jest case count.

### PostgreSQL service checks

Use the local `rord_mai_dat02_practice` database after migrations 001 and 002 have been applied. Configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` in the same terminal session. Do not put passwords in this document or source files. The Node scripts check the database name before creating fixtures.

From `apps/api`:

```powershell
npm.cmd run check:consent:grant
npm.cmd run check:consent:write
npm.cmd run check:consent:race
```

Expect respectively 4, 5, and 2 PASS messages. Assertions fail the process with a nonzero exit code. These commands are not part of `npm test`. A simulated identity is used here; this is not evidence of real LINE authentication.

### SQL schema checks

From a terminal whose working directory is the repository root and whose PostgreSQL environment variables point to the practice database:

```powershell
psql -X -v ON_ERROR_STOP=1 -f scripts/database/verify-core.sql
psql -X -v ON_ERROR_STOP=1 -f scripts/database/verify-storage-consent.sql
```

Core verification needs migration 001; consent verification also needs 002. These scripts do not enforce a particular database name, so check the target first. Successful checks roll back their fixtures. If a script fails in an interactive psql session, issue `ROLLBACK;` before continuing.

The core script uses fixed join codes `TST001` and `TST002`; consent SQL uses fixed LINE IDs `prv01-schema-test` and `prv01-new-grant`. Existing records with those values can cause fixture collisions. Use an isolated practice database. The Node scripts use random identities and clean up their own records in `finally`; abrupt process termination can prevent that cleanup. Random six-character join codes can also collide, and those scripts currently do not retry.

## Automated Jest case catalogue

IDs below are documentation identifiers. Source test names remain the executable identifiers. Unless stated otherwise, validation cases start from the valid fixture in their source file and change only the indicated input.

### create-section.test.js: 20 cases

Valid fixture: criterion grading, weights 60 and 40, ordered thresholds, and a real withdrawal date. Rows CS-02 to CS-11 directly assert validator failure, not an HTTP response.

| ID | Action/input | Asserted result |
| --- | --- | --- |
| CS-01 | Validate course code ` EN123 ` | Success; output is `EN123`; input retains its spaces. |
| CS-02 | Set date to `2026-02-30` | Validation fails. |
| CS-03 | Remove criterion thresholds | Validation fails. |
| CS-04 | Set B threshold to 80, breaking strict order | Validation fails. |
| CS-05 | Add `studentId` to a component | Validation fails for unsupported nested input. |
| CS-06 | Change first weight to 55, total 95 | Validation fails. |
| CS-07 | Use weight `60.001` | Validation fails. |
| CS-08 | Use credits string `"3"` | Validation fails; no implicit numeric conversion. |
| CS-09 | Set maximum score to Infinity | Validation fails. |
| CS-10 | Set a component to null | Validation fails. |
| CS-11 | Change to norm grading but retain criterion thresholds | Validation fails. |
| CS-12 | Validate null | Validation fails. |
| CS-13 | Validate an array | Validation fails. |
| CS-14 | Validate number 5 | Validation fails. |
| CS-15 | Validate string `hello` | Validation fails. |
| CS-16 | Validate an empty object | Validation fails. |
| CS-17 | Norm grading, null thresholds, weights 33.33/33.33/33.34 | Validation succeeds. |
| CS-18 | POST valid fixture, empty object, then text to section creation | Respectively 201 through the controlled service adapter; 400 with nonempty error details; 415. Real persistence is tested separately against PostgreSQL. |
| CS-19 | GET health and an unknown path | Health body has `data.status = ok`; unknown path has `ROUTE_NOT_FOUND`. This case does not explicitly assert status codes. |
| CS-20 | Throw a private error in a temporary Express route | 500 and `INTERNAL_SERVER_ERROR`; response excludes private message. |

### sections.test.js: 12 cases

Each case creates a fresh app and sends a POST to `/api/v1/sections/join`.

| ID | Input/action | Asserted result |
| --- | --- | --- |
| JOIN-01 | `ABC123` | 201 through the controlled service adapter, normalized code asserted. |
| JOIN-02 | ` abc123 ` | 201 through the controlled service adapter, normalized ABC123 asserted. |
| JOIN-03 | Missing code | 400 and `VALIDATION_ERROR`. |
| JOIN-04 | Numeric code 123456 | 400 and `VALIDATION_ERROR`. |
| JOIN-05 | Short code `AB` | 400 and `VALIDATION_ERROR`. |
| JOIN-06 | Long code `ABCDEFG` | 400 and `VALIDATION_ERROR`. |
| JOIN-07 | Invalid characters `ABC!23` | 400 and `VALIDATION_ERROR`. |
| JOIN-08 | Array body | 400 and `VALIDATION_ERROR`. |
| JOIN-09 | Add a body `studentId` | 400 and `VALIDATION_ERROR`. |
| JOIN-10 | Truncated JSON | 400 and `INVALID_JSON`. |
| JOIN-11 | `text/plain` body | 415 and `UNSUPPORTED_MEDIA_TYPE`. |
| JOIN-12 | JSON with 110 KiB of padding | 413 and `PAYLOAD_TOO_LARGE`. |

### consent-service.test.js: 9 cases

All cases inject a fake pool/client. Recorded query calls prove service sequencing and arguments; they cannot prove that PostgreSQL accepts the SQL or acquires a lock.

| ID | Setup/action | Asserted result |
| --- | --- | --- |
| CONS-01 | Omit identity on grant and guarded write | Both reject with status 401; no connection acquired. |
| CONS-02 | Grant with false, undefined, `"true"`, or 1 | 400 `EXPLICIT_CONSENT_REQUIRED`; no connection. |
| CONS-03 | Grant using policy `old` | 409 `POLICY_VERSION_OUTDATED`; no connection. |
| CONS-04 | Grant valid consent | One connection; identity and policy passed as query parameters; BEGIN then COMMIT; result returned; client released without error. |
| CONS-05 | Guard finds no student | 403 `STORAGE_CONSENT_REQUIRED`; callback cannot run; rollback and release. |
| CONS-06 | Guard finds false consent | Same rejection, rollback, and release. |
| CONS-07 | Guard finds true consent; caller also supplies forged studentId | Callback gets database ID and same client; query contains FOR UPDATE; callback result returned; write precedes commit. |
| CONS-08 | Callback throws | Original failure propagates; rollback and release; no commit. |
| CONS-09 | Callback throws and rollback also fails | Original write failure propagates; release receives rollback error so the client can be discarded. |

### consent-errors.test.js: 5 cases

These call the error middleware directly with mocked response methods.

| ID | Input | Asserted result |
| --- | --- | --- |
| ERR-01 | 401 / UNAUTHENTICATED | Same status/code; public string message excludes private detail. |
| ERR-02 | 400 / EXPLICIT_CONSENT_REQUIRED | Same status/code; public string message excludes private detail. |
| ERR-03 | 409 / POLICY_VERSION_OUTDATED | Same status/code; public string message excludes private detail. |
| ERR-04 | 403 / STORAGE_CONSENT_REQUIRED | Same status/code; public string message excludes private detail. |
| ERR-05 | Unknown code, then known code with mismatched status | Both return 500 and `INTERNAL_SERVER_ERROR`. Two variants in one case. |

## Real database service cases

Each script first checks the database name and uses its own generated identity. These assertions are independent of the 46 Jest cases.

| ID | Script | Steps | Expected result |
| --- | --- | --- | --- |
| DB-01 | consent-db-check.js | Decline, then query student | EXPLICIT_CONSENT_REQUIRED; no row. |
| DB-02 | consent-db-check.js | Accept old policy, then query | POLICY_VERSION_OUTDATED; no row. |
| DB-03 | consent-db-check.js | Accept v1, then read persisted row | One matching student, true consent, v1 policy, Date-valued grant time. |
| DB-04 | consent-db-check.js | Accept v1 again | Same ID and grant time; still one row. |
| DB-05 | consent-write-check.js | Attempt guarded section insert without identity | UNAUTHENTICATED; no section. |
| DB-06 | consent-write-check.js | Attempt write before student exists | STORAGE_CONSENT_REQUIRED; no student or section. |
| DB-07 | consent-write-check.js | Insert false-consent student fixture, attempt write | STORAGE_CONSENT_REQUIRED; no section. Fixture insertion deliberately bypasses the application to set up this case. |
| DB-08 | consent-write-check.js | Grant consent, insert section through callback client | Section exists after service returns. |
| DB-09 | consent-write-check.js | Insert another section through callback, then throw | Error propagates; new section absent; previously committed section still exists. |
| DB-10 | consent-race-check.js | Lock student in another transaction, set false consent without commit, start guarded request | PostgreSQL reports a writer blocked by the held lock; callback has not run. |
| DB-11 | consent-race-check.js | Commit false consent and await pending request | STORAGE_CONSENT_REQUIRED; callback still has not run. |

The race script uses three pool connections so lock observation can proceed while the withdrawal connection holds a lock and the writer connection waits. It polls for at most 5 seconds and sets a 10-second statement timeout. It observes blocking rather than treating a fixed sleep as proof. The guarded callback is a sentinel flag in this script, not an actual section insert.

## SQL schema cases

### verify-core.sql

| ID | Operation | Expected result |
| --- | --- | --- |
| SQL-01 | Insert linked students, sections, components, enrollment, and score 0 | Valid records accepted, including recorded zero. |
| SQL-02 | Duplicate student/section enrollment | Unique constraint violation. |
| SQL-03 | Duplicate score for enrollment/component | Unique constraint violation. |
| SQL-04 | Update score to -1 | Check constraint violation. |
| SQL-05 | Connect score to component from another section | Foreign-key violation. |
| SQL-06 | Delete an enrolled section | Restricted deletion / foreign-key violation. |
| SQL-07 | Delete student | Their enrollment and scores disappear; shared section remains. |

### verify-storage-consent.sql

| ID | Operation | Expected result |
| --- | --- | --- |
| SQL-08 | Insert student without consent fields | Stored consent is false. This tests the new-row default, not upgrading a preexisting row. |
| SQL-09 | Set true without evidence | Check constraint violation. |
| SQL-10 | Set true with blank policy and timestamp | Check constraint violation. |
| SQL-11 | Set true with policy and infinite timestamp | Check constraint violation. |
| SQL-12 | Set true with v1 and current timestamp | Update succeeds. |
| SQL-13 | Set false while retaining grant evidence | Check constraint violation. |
| SQL-14 | Insert explicit grant | Generated student ID and grant timestamp are non-null. |

Expected final consent SQL message: `Storage consent schema checks passed; test rows rolled back.` Both scripts stop on unexpected SQL errors. Direct SQL fixtures are not evidence that the API permits those operations.

## Evidence and coverage limits

During the preceding folder cleanup on 2026-09-21, the assistant ran all 46 Jest cases successfully. The developer supplied successful practice migration/schema output and all 11 Node database PASS messages earlier in this conversation. The database scripts were not rerun during cleanup or this documentation work. These are dated execution results, not a guarantee that every future checkout passes.

24 September update: create/join now persist through the guarded academic service. The old placeholder assertions have been replaced. The PostgreSQL suite covers consent rejection for every implemented academic writer, transactions, private ownership, shared corrections and deletion. PRV-01 still needs the future chat writers and live release verification before its full presentation gate is complete. See docs/development/interfaces.md for current behaviour.

Still unverified or unimplemented:

- Writer-first ordering, concurrent grants, and complete withdrawal/deletion behaviour.
- Real LINE token verification and authorization of target resources.
- Consent enforcement through every actual HTTP, webhook, and background write path.
- Automated Jest database integration setup and isolated fixture lifecycle.
- Migration lifecycle and existing-row upgrade behaviour in this checked-in suite; manual schema checks do not cover every constraint.
- Some boundary/error paths, including every validator limit, pool/commit failures, and server shutdown. No numerical code-coverage result was collected.

Update cases alongside implementation. Record the command, date, environment, and result for each run; keep expected outcomes separate from observed results.
