# Rord Mai

## Project documentation

Read the [folder rationale and file-by-file guide](docs/project-guide.md) first, then the [test-case catalogue and execution guide](docs/testing/test-cases.md).

## Run the API

From apps/api, run `npm ci`, then `npm start`. For automatic restart use `npm run dev`. Node.js 20 or newer is required. Default port is 3000; set the PORT environment variable to change it. This server does not load .env files automatically.

Run `npm test` from apps/api. Tests create temporary listeners and do not require the development server or a database.

## Read the code

1. apps/api/src/server.js starts the process and handles shutdown.
2. apps/api/src/app.js configures parsing, routes, fallback, and errors.
3. apps/api/src/http/routes/section-routes.js maps section URLs to middleware.
4. apps/api/src/http/middleware/validate-create-section.js translates validation results to HTTP.
5. apps/api/src/lib/validate-create-section.js checks plain input without network or database access.
6. apps/api/tests contains regression tests for these behaviors.

GET /health returns 200. POST /api/v1/sections and /api/v1/sections/join validate input and return 501 for valid requests. No student records are stored. Authentication and feature persistence are future work.

The current API-01 specification is docs/api/contract.md. Team review is outstanding. The earlier learning notes in docs/api/README.md are historical and are superseded where they differ from the contract.

The PRV-01 storage-consent migration and service are described in [storage consent](docs/database/storage-consent.md). They provide explicit consent recording and a transaction-scoped write guard. Practice database checks have passed as reported by the developer; live authentication, application database wiring and route integration remain future work.

## Repository layout

| Location | Purpose |
| --- | --- |
| `apps/api/src/` | API application code |
| `apps/api/tests/` | Jest regression tests, no database required |
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
