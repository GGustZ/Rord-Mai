# Rord Mai

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

The PRV-01 storage-consent migration and service are described in [storage consent](docs/database/storage-consent.md). They provide explicit consent recording and a transaction-scoped write guard; live authentication, database connections and route integration remain future work.
