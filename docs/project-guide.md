# Project structure and entry points

Reviewed against the 30 October 2026 release candidate. See [architecture](architecture.md), [API contract](api/contract.md) and [release evidence](testing/release-2026-10-30.md).

| Location | Responsibility |
|---|---|
| `apps/web/src/` | React LIFF onboarding, privacy, course setup/join, entries, OCR draft confirmation and GPAX comparison. |
| `apps/web/tests/` | Phone/desktop browser checks using a real local API/PostgreSQL and controlled LINE/native OCR adapters. The opt-in demo test records fictional local data only. |
| `apps/api/src/server.js` | Validates environment, awaits migrations, starts HTTP/chat and handles shutdown. |
| `apps/api/src/app.js` | Configures raw webhook parsing, REST JSON parsing, verified identity, routers and safe errors. |
| `apps/api/src/http/` | HTTP routes, request validation and error translation. |
| `apps/api/src/services/` | Consent, ownership, transactions, academic operations, GPAX scenarios, explanations, OCR, chat and deadline evaluation. |
| `apps/api/src/repositories/` | Parameterised reads, ownership checks and job lookup. Some transactional SQL remains directly in services; a repository folder does not imply every SQL statement has moved there. |
| `apps/api/src/adapters/` | LINE identity/messaging, Gemini and calculation-engine integration. |
| `apps/api/src/lib/` | Pure input validation and known application errors. |
| `apps/api/tests/` | API/unit/HTTP checks, provider/image fixtures and a separate PostgreSQL integration suite. |
| `packages/engine/` | Pure calculation core, grade-point constants and boundary checks. It performs no I/O. |
| `migrations/` | Canonical numbered schema history and development rollback SQL. No 30 October schema change is required. |
| `scripts/` | Explicitly invoked release checks, deadline evaluation, LINE menu registration and database verification. |
| `docs/` | Current API/setup/architecture/privacy documents, test/UAT evidence and a final-report candidate. |

## Request and calculation flow

LIFF sends an ID token. Authentication verifies it with LINE before a protected route runs. Consent-locked services load owned records, use the shared engine and persist with parameterised SQL. The engine owns numerical results. Routes do not implement a second calculation.

The webhook verifies original bytes before parsing. Consented events are durably accepted before acknowledgement and processed by the worker. A pre-consent reminder remains in request memory and sends after acknowledgement. The worker reuses the academic writer, so chat and web entries have the same consent/ownership rules.

Section structures and revisions are shared. Profiles, enrollments, scores, attendance, jobs, conversations and notification records are private. Confirmed deletion cascades through private records and clears shared creator/actor attribution. See [data inventory](privacy-data-inventory.md).

## Running and interpreting checks

`npm run check` runs lint, API/unit/HTTP tests, engine tests and the production web build. Database integration and browser checks require a disposable database named `rordmai_test`; their setup truncates test tables. Never point these suites at an application database. Native OCR and container smoke tests are separate.

Passing controlled local tests establishes tested local behavior. Real LINE/Gemini, public deployment, independent review, fresh-machine setup and participant UAT require their own evidence. Historical notes under `docs/api/README.md` and earlier dated reports do not override the current contract.
