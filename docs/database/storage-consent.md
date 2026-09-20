# PRV-01 storage consent foundation

The migration and consent service are installed in this repository. The developer confirmed migration and verification in the local practice database. Live route integration and application database wiring remain pending.

## Flow

Verified LINE identity -> explicit storage acceptance -> validate policy version -> transaction creates student UUID and consent evidence together. Repeated acceptance reuses the same student. Declining creates no student. Declining is not withdrawal of an earlier grant.

For each academic write, `withStorageConsent` locks the verified student's row, checks consent, and runs the supplied callback using the same database client. Failure rolls back. The caller must check resource ownership and await every write. Consent withdrawal must use the same row lock before deleting academic data.

External AI consent is a separate optional choice. This change implements storage consent only; it does not grant or store external AI permission.

## Files and migration

- Service: `apps/api/src/services/consent-service.js`.
- Migration: `migrations/002_storage_consent.up.sql`.
- Development rollback: `migrations/002_storage_consent.down.sql`.
- Schema verification: `scripts/database/verify-storage-consent.sql`.

Apply only after the DAT-02 core migration has created `students`. The core migration and its rollback are included in `migrations/001_core.up.sql` and `migrations/001_core.down.sql`. The original context copies are preserved. Use psql with error stopping enabled. The up migration defaults existing students to no consent and preserves existing academic data. The down migration destroys consent evidence, so stop writers first and use it only for development rollback.

## Integration requirements

Construct `createConsentService({ pool, currentPolicyVersion })` with a node-postgres-compatible pool. The API package includes `pg` for the manual database checks; DAT-11 will supply application database wiring. No production connection is configured here. Only verified authentication may supply `identity.lineUserId`, never request-body values or unverified token claims.

Call `grantStorageConsent({ identity, accepted: true, policyVersion })` for an explicit grant. Call `withStorageConsent({ identity }, async ({ client, studentId }) => { ... })` around academic writes. Use the supplied client throughout. The error handler exposes only the recognised consent errors with fixed public messages.

Current section routes still return 501 for valid requests. Connect this service as those routes gain persistence. Future webhook and background writers must use the same guard. Database constraints validate evidence but do not stop direct academic writes from bypassing the service.

## Verification and remaining work

The context draft passed nine service unit tests and PostgreSQL 18 up/verify/down/up/verify on a disposable database. The copied tests run under the repository's Jest suite, with additional error-response tests.

On 2026-09-21, all 46 tests across four repository test suites passed after integration. Git diff whitespace checks also passed.

The developer subsequently reported successful migration and schema verification in `rord_mai_dat02_practice`, plus 11 passing checks across these standalone scripts:

| Script under `apps/api/scripts/database/` | Command from `apps/api` | Coverage |
| --- | --- | --- |
| `consent-db-check.js` | `npm run check:consent:grant` | Four checks: decline, old policy, grant persistence, repeated grant |
| `consent-write-check.js` | `npm run check:consent:write` | Five checks: missing identity/student/consent, commit, rollback |
| `consent-race-check.js` | `npm run check:consent:race` | Two checks: writer blocks behind withdrawal, then rejects withdrawn consent |

These are user-reported database execution results, not an automated Jest integration suite. The race script simulates only consent-state withdrawal. Writer-first concurrency, verified authentication, endpoint integration, and withdrawal/audit-retention decisions remain outstanding. PRV-01 is In progress until actual write paths are guarded and verified. Folder reorganization does not execute migrations or rerun these database checks.

