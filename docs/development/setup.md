# Development and deployment

## Fresh local setup

Use Node.js 24 and PostgreSQL 18. From the repository root:

```powershell
npm.cmd ci --prefix apps/api
npm.cmd ci --prefix apps/web
Copy-Item .env.example .env
```

Set the real LINE Login channel ID and LIFF ID in .env, plus a fresh local DATABASE_URL.
Never commit .env or paste secrets into the AI conversation.
Use a fresh empty database. The runner refuses to guess which versions were manually applied to an existing practice database.

```powershell
npm.cmd run build
npm.cmd start
```

Startup applies pending migrations before opening HTTP. Migration failures stop startup.
GET /health checks the process; GET /ready also checks PostgreSQL.
Only LIFF ID and storage policy version are returned from /api/config.

For Docker: set POSTGRES_PASSWORD, LINE_LOGIN_CHANNEL_ID and LIFF_ID in .env, then run:
```powershell
docker compose up --build
```
Use a URL-safe local development password in Compose. App and DB use a private container network; local published ports bind to loopback.
The container includes Tesseract with Thai/English data and Poppler. OCR accepts screenshots and PDFs up to eight pages, with a 5 MiB file limit. On Windows without Docker, install native Tesseract and Poppler separately, add Poppler to PATH, and set TESSERACT_COMMAND to the Tesseract executable. Missing tools return an unavailable response; manual entry remains usable. LINE chat returns extracted rows for review and manual entry in LIFF.

Optional Gemini configuration uses GEMINI_API_KEY and GEMINI_MODEL together. Leave both empty for complete local Thai templates. Keep server credentials out of Vite variables. An explicitly configured model must support Generate Content JSON responses; errors and a five-second timeout fall back locally. External processing also requires the student's separate consent.

## Deadline notifications

The hourly workflow runs at minute 17 UTC. Create a GitHub environment named `notifications`, restrict access to the release/default branch, and supply DATABASE_URL, LINE_CHANNEL_ACCESS_TOKEN, LIFF_ID and STORAGE_POLICY_VERSION as protected secrets. Use the deployed database after migration 006. The runner never applies migrations. Enable scheduled operation only after a real test-account push and configuration review. GitHub schedules can be delayed or skipped; this is not an exact-time delivery guarantee.

For one controlled run:

```powershell
node --env-file=.env scripts/run-deadline-alerts.cjs
```

This command sends real pushes to eligible consented accounts when real credentials are configured. It retries transient failures using the persisted LINE key, prints only counts/times, and returns a failure exit code on permanent/exhausted delivery errors. Keep test runs limited to the agreed accounts and fictional data.

## Verification

```powershell
npm.cmd run check
$env:TEST_DATABASE_URL='postgresql://TEST_USER:TEST_PASSWORD@localhost:5432/rordmai_test'
npm.cmd run test:integration
npm.cmd --prefix apps/web run test:browser
```

Integration tests truncate tables inside the explicitly named disposable rordmai_test database.
Never point the test URL at academic data. On Windows, BROWSER_CHANNEL=msedge uses installed Edge.
Otherwise install the Playwright Chromium browser using `npx playwright install chromium` from apps/web.

Browser tests also require TEST_DATABASE_URL and truncate the disposable database before starting. The academic browser journey uses the real Express API and PostgreSQL; privacy/error UI tests use controlled responses. All browser tests replace only the LINE SDK identity module where needed. The production server always uses the real LINE adapter.
There is no environment setting to bypass authentication.

## Free Render deployment

render.yaml defines an app and PostgreSQL in Singapore. Import the repository as a Blueprint and supply LINE_LOGIN_CHANNEL_ID, LIFF_ID, LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN. Confirm both plans are free before creation. No paid upgrade is authorised.

The Docker startup runs migrations because a separate pre-deploy step may be unavailable on a free service.
The app must pass /ready. Set the LIFF endpoint to the public HTTPS root after deployment.

```powershell
node scripts/check-deployment.cjs https://YOUR-SERVICE.onrender.com
```

A successful local build is not a deployed service. Record the URL and executed live results separately.
Free services sleep when idle. Free PostgreSQL expires after 30 days. Record creation and expiry dates and export before expiry, then decide continuity before the provisional final deadline.
Use pg_dump/pg_restore with a secure environment or database client. Restore to a separate empty database and verify counts before relying on a backup.

Provider reference: https://render.com/docs/free (rechecked 27 September 2026).

## LINE setup

1. Create the LINE OA and enable Messaging API. Keep its provider ID.
2. Create LINE Login under the same provider, enable web app and add both test accounts as testers while the channel is in development.
3. Add a LIFF app with openid scope and the public HTTPS endpoint. Record the LIFF ID and Login channel ID in server configuration.
4. Open LIFF from each test account. Check that login alone creates no student record, grant creates one, and confirmed deletion removes it.
5. Follow [LINE chat and release setup](../line/release-setup.md) for webhook registration, Rich Menu and real identity-parity checks. Local chat tests do not prove real LINE delivery.

Server identity verification: https://developers.line.biz/en/reference/line-login/#verify-id-token
LIFF user data: https://developers.line.biz/en/docs/liff/using-user-profile/

## GitHub protection, pending remote configuration

The local workflow named Checks runs lint, API/engine tests, database tests, web build and Docker build.
After the first workflow run exists, configure protection for main:

- Require a pull request and one approving review.
- Dismiss stale reviews after new commits.
- Require the verify check to pass and the branch to be current.
- Block force pushes and deletion. Apply the rule to administrators if available.
- Demonstrate a deliberately failing PR is blocked and a reviewed green PR can merge.

Writing workflow YAML does not configure repository protection. On 30 October 2026 the branch API reported main unprotected, no required status checks, and no repository rulesets. No settings were changed. Record administrative acceptance after configuration.

## Local demo recording

The opt-in `@demo` browser case uses fictional data and controlled LINE identity, not real provider or participant acceptance. It covers manual setup, marks, target calculation, GPAX comparison, local Thai explanation and confirmed deletion.

```powershell
$env:RECORD_DEMO='1'
$env:BROWSER_CHANNEL='msedge'
npm.cmd --prefix apps/web run test:browser -- --project=desktop --grep '@demo' --workers=1
Remove-Item Env:RECORD_DEMO
```

Requires the same disposable `TEST_DATABASE_URL` as other browser tests. Recordings go to ignored browser test results. The reviewed submission candidate is linked from `docs/submission/README.md`. Its 68-second duration includes slower playback for readable captions.
