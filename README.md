# Rord Mai

## Project documentation

Read the [folder rationale and file-by-file guide](docs/project-guide.md) first, then the [test-case catalogue and execution guide](docs/testing/test-cases.md).

## Run the API

Use Node.js 24 and PostgreSQL 18. Follow [setup and deployment](docs/development/setup.md) for a fresh database, LINE configuration and the React build. From the repository root, `npm start` loads `.env` and starts Express after migrations succeed. Default port is 3000.

From the repository root, `npm run check` runs ESLint, API and engine tests, and the React production build. `npm run test:integration` requires a disposable `rordmai_test` PostgreSQL database. Browser tests are separate and use controlled LINE responses.

## Read the code

1. apps/api/src/server.js starts the process and handles shutdown.
2. apps/api/src/app.js configures parsing, routes, fallback, and errors.
3. apps/api/src/http/routes/section-routes.js maps section URLs to middleware.
4. apps/api/src/http/middleware/validate-create-section.js translates validation results to HTTP.
5. apps/api/src/lib/validate-create-section.js checks plain input without network or database access.
6. apps/api/tests contains regression tests for these behaviors.

GET /health checks HTTP and GET /ready checks PostgreSQL. Protected routes verify LIFF ID tokens. Consent read/grant, own enrolment listing and confirmed deletion work with PostgreSQL. Section create/join still return 501 for authenticated valid requests. Course and score UI integration are later stages.

The current API-01 specification is docs/api/contract.md. Team review is outstanding. The earlier learning notes in docs/api/README.md are historical and are superseded where they differ from the contract.

The earlier PRV-01 foundation is described in [storage consent](docs/database/storage-consent.md). The current lifecycle and teammate interfaces are documented in [integration interfaces](docs/development/interfaces.md). Migration 003 adds deletion-linked private tables and nullable shared creator/revision attribution. Live LINE, cloud deployment and repository protection still need external verification.

## Repository layout

| Location | Purpose |
| --- | --- |
| `apps/api/src/` | API application code |
| `apps/api/tests/` | Jest unit/HTTP tests and separate PostgreSQL integration tests |
| `apps/web/` | React/LIFF frontend and browser tests |
| `packages/engine/` | Pure calculation core and Jest tests |
| `apps/api/scripts/database/` | Manual Node.js database checks |
| `migrations/` | Canonical SQL migrations and development rollbacks |
| `scripts/database/` | SQL schema verification scripts |
| `docs/api/` | API contract and supporting notes |
| `docs/database/` | Database design and consent documentation |
| `docs/database/diagrams/` | Editable ER diagram and PNG export |

## Database checks

Use `scripts/database/verify-core.sql` and `scripts/database/verify-storage-consent.sql` through psql to verify their respective schemas after applying the migrations. Both roll back their test data. Keep executable migrations only in `migrations/`.

For manual consent checks, configure `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` in your terminal session. The scripts require the migrated `rord_mai_dat02_practice` database. Do not commit credentials. From `apps/api`, run:

```text
npm run check:consent:grant
npm run check:consent:write
npm run check:consent:race
```

These checks create temporary records and clean up their own data. They run separately from `npm test`. The race check covers withdrawal-first ordering, not a complete withdrawal endpoint or data-deletion workflow.
