# Project structure and file guide

Reviewed against the repository on 2026-09-21. Start here, then read [test cases](testing/test-cases.md).

## Why these folders exist

The organizing principle is responsibility: application code, checks, database changes, and explanations have different purposes and execution requirements. A folder should tell you what its files are for and when to use them.

| Folder | Why it belongs here |
| --- | --- |
| `apps/api/` | One runnable Node.js application, with its own dependencies and commands. Keeping this boundary allows another application to be added later without mixing its dependencies into the API. No frontend application exists here yet. |
| `apps/api/src/` | Code used by the API at runtime. Tests and maintenance scripts should not start just because the server starts. |
| `src/http/routes/` | Connects HTTP methods and URLs to request processing. Routes are the API entry points. |
| `src/http/middleware/` | Handles HTTP concerns such as body validation, content types, and error responses. It can read Express request/response objects. |
| `src/lib/` | Plain reusable logic without HTTP or database access. The section validator accepts an object and returns a result, making it easy to test directly. |
| `src/services/` | Coordinates application operations. Consent requires policy checks, SQL, transactions, and locks; it belongs here rather than inside a URL handler. |
| `apps/api/tests/` | Automated Jest test-case files. They exercise application behaviour without running the production server. Each file can contain many cases. |
| `apps/api/scripts/database/` | Manually invoked Node.js database checks. They stay inside the API package so Node can resolve its `pg` dependency. They require PostgreSQL, unlike the current Jest suite. |
| `migrations/` | The single executable history of schema changes. Numbered files establish order; duplicated migrations would create competing sources of truth. |
| `scripts/database/` | SQL verification utilities that inspect behaviour of the migrated schema. They test schema rules rather than define a new schema version. |
| `docs/` | Human-readable explanations. Reading documentation should not change data. |
| `docs/api/` | Request/response specifications and earlier API notes. A specification describes intended behaviour, which may not yet be implemented. |
| `docs/database/` | Data relationships, storage-consent design, and diagrams. |
| `docs/database/diagrams/` | Editable diagram source and its image export, kept inside Git so the team can version them with the schema. |
| `docs/testing/` | Written test cases, execution instructions, and coverage limits. Executable tests remain in the application package. |

This is a small project, so more layers are not automatically better. There is currently no repository layer or separate controllers directory. Add a layer when it has a concrete responsibility, not just to imitate a larger project.

### How the files work together

Current section request flow:

```text
server.js starts the listener
  -> app.js parses JSON and selects the router
  -> section-routes.js selects create or join
  -> validation middleware checks the request
  -> valid input currently receives 501 NOT_IMPLEMENTED

Parsing errors or unexpected failures -> error-handler.js
```

For section creation, middleware calls the plain validator in `src/lib/`. The validator does not send HTTP responses; middleware translates its result into either an error response or `req.validated`.

The consent service is currently exercised separately by tests and scripts. Its intended persistence flow is verified identity -> consent service -> locked student row -> write callback using the same database client -> commit or rollback. It is not wired into the section routes yet. The service checks the identity object's shape; actual LINE token verification must happen elsewhere.

### Migrations, tests, and scripts are different

- A migration deliberately changes the schema. Apply `001` before `002`; do not rerun an already applied migration as a test.
- A test contains setup, an action, and assertions about expected results. Jest discovers the current `*.test.js` files when `npm test` runs. The `tests` folder name alone does not make arbitrary files executable tests.
- A script is an explicitly invoked utility. The consent scripts contain assertions too, so they are database integration checks, even though they do not use Jest.
- A SQL verification script performs database checks and rolls back its test transaction. It does not replace service or HTTP tests.

## File-by-file inventory

Paths below are relative to the repository root. This covers all project-owned files, including this guide and the test document. Installed dependencies under `node_modules/` and Git's internal files under `.git/` are generated/tool-managed content, not individual application files to document.

### Root and package files

| File | What it does |
| --- | --- |
| `.gitignore` | Excludes dependencies, build/coverage output, local environment files, uploads, logs, and editor metadata from normal Git tracking. It does not remove files already tracked. |
| `README.md` | Entry point for setup, starting the API, repository navigation, and database-check commands. |
| `apps/api/package.json` | Declares the API package, CommonJS mode, runtime dependencies (`express`, `pg`), development tools (`jest`, `supertest`), and npm commands. |
| `apps/api/package-lock.json` | Records the resolved dependency tree and integrity information for repeatable installation with `npm ci`. Keep it alongside `package.json`; do not hand-edit dependency resolutions. |

### Runtime code

| File | What it does |
| --- | --- |
| `apps/api/src/server.js` | Creates the app, validates `PORT` (default 3000), opens the listener, reports server errors, and handles termination with a shutdown deadline. |
| `apps/api/src/app.js` | Builds and returns the Express app without opening the production listener. Disables the identifying header, configures a 100 KiB JSON limit, adds health and section routes, and installs 404/error handling. This separation lets Supertest create app instances. |
| `apps/api/src/http/routes/section-routes.js` | Registers create-section and join-section POST handlers. Runs their validation middleware and currently returns 501 for valid requests; it does not save data. |
| `apps/api/src/http/middleware/validate-create-section.js` | Requires JSON, calls the plain section validator, returns 400 with field details on failure, or stores normalized data in `req.validated` and continues. |
| `apps/api/src/http/middleware/validate-join-section.js` | Requires a JSON object containing only a string `joinCode`; trims and uppercases it, enforces six ASCII letters/digits, and stores the validated value. |
| `apps/api/src/http/middleware/error-handler.js` | Converts malformed JSON, oversized bodies, and recognized consent errors into public error responses. Unexpected errors are logged and become a generic 500; already-sent responses are delegated to Express. |
| `apps/api/src/lib/validate-create-section.js` | Validates and normalizes section metadata, real dates, grading thresholds, and 1 to 30 assessment components without mutating the input. It checks total weight using integer hundredths (10000 means 100%) and rejects unsupported fields and invalid numeric values. |
| `apps/api/src/services/consent-service.js` | Exports a service factory supplied with a pool and policy version. Grants explicit consent using an upsert; guards academic writes by locking the student row and checking consent within the same transaction. Commits success, rolls back errors, and releases the client. It does not verify LINE tokens, authorize resource ownership, or implement withdrawal. |

### Automated tests

See [the case catalogue](testing/test-cases.md) for individual scenarios and expected results.

| File | What it does |
| --- | --- |
| `apps/api/tests/create-section.test.js` | Tests plain section validation and HTTP create/health/not-found/unexpected-error behaviour. Contains 20 expanded Jest cases. |
| `apps/api/tests/sections.test.js` | Tests join requests, invalid shapes/codes, malformed JSON, content type, and body size through Express. Contains 12 cases. |
| `apps/api/tests/consent-service.test.js` | Uses a fake pool/client to test consent rejection, query parameters, transaction sequencing, callback arguments, rollback, and connection release. Contains 9 cases; does not execute SQL. |
| `apps/api/tests/consent-errors.test.js` | Tests consent error mappings and fallback for unknown or mismatched errors with mocked response methods. Contains 5 cases. |

### Manual database checks

| File | What it does |
| --- | --- |
| `apps/api/scripts/database/consent-db-check.js` | Connects to the practice database and checks decline, old policy, grant persistence, and repeated acceptance. Cleans up its uniquely named test student. |
| `apps/api/scripts/database/consent-write-check.js` | Checks missing identity/student/consent rejection, committed section creation, and rollback after an inserted section is followed by an error. Cleans up its own sections and student. |
| `apps/api/scripts/database/consent-race-check.js` | Holds the student lock in a simulated withdrawal transaction, observes a blocked service request through PostgreSQL lock information, commits withdrawal, and asserts that the write callback does not run. Covers withdrawal-first ordering only. |
| `scripts/database/verify-core.sql` | Creates related fixtures, checks uniqueness, score validity, same-section relationships, restricted deletion, and student-data cascades. Rolls back its transaction after verification. |
| `scripts/database/verify-storage-consent.sql` | Checks the false default and consent evidence constraints, then verifies explicit grant generates an ID/timestamp. Rolls back its fixtures. It does not enforce application write-path consent. |

### Schema migrations

| File | What it does |
| --- | --- |
| `migrations/001_core.up.sql` | Creates students, sections, components, enrollments, and scores, with primary/foreign keys, uniqueness, checks, and lookup indexes. Composite foreign keys prevent scores crossing section boundaries. |
| `migrations/001_core.down.sql` | Drops the five core tables in dependency order. This removes their data; it is a deliberate development rollback, not a verification command. |
| `migrations/002_storage_consent.up.sql` | Adds false-by-default storage consent, policy version, and grant time to students. Requires evidence for true consent and null evidence for false consent. |
| `migrations/002_storage_consent.down.sql` | Removes the consent constraint and columns, destroying stored consent evidence. Writers must be stopped before a deliberate rollback. |

### Documentation and diagrams

| File | What it does |
| --- | --- |
| `docs/project-guide.md` | This guide: explains folder boundaries, request flow, and every project-owned file. |
| `docs/testing/test-cases.md` | Lists current test scenarios, expected outcomes, prerequisites, commands, known gaps, and execution evidence. |
| `docs/api/contract.md` | Consolidated API-01 specification for intended transport, identity, request/response types, endpoints, and errors. Most listed features are not implemented. |
| `docs/api/README.md` | Historical API learning notes. Use the consolidated contract when they differ. |
| `docs/database/design.md` | Explains the five-table design, relationships, type choices, integrity rules, and later application/schema responsibilities. It is a design note, not proof of current feature completion. |
| `docs/database/storage-consent.md` | Explains the consent service, migrations, manual checks, integration requirements, and remaining PRV-01 work. |
| `docs/database/diagrams/ERD.drawio` | Editable diagrams.net source for the entity-relationship diagram. Update this source when maintaining the diagram. |
| `docs/database/diagrams/ERD.png` | Image export of the ER diagram for viewing and sharing. Regenerate from the editable source after diagram changes; the image itself is not an executable schema. |

Outside the repository, `Rord-Mai Project/Context/.$ERD.drawio.bkp` is a retained diagram-editor backup. It is not runtime code and is not included in this repository's commits. Its redundancy has not been established, so it was not deleted.

## How to maintain this organization

Put new runtime behaviour under `src/` according to responsibility and its automated cases under `tests/`. Keep database-dependent checks explicitly separate until a deliberate integration-test setup exists. Add schema changes as new numbered migrations rather than copying existing migrations to another folder. Update this inventory and the test catalogue when adding or moving project files.
