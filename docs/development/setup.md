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
The container includes Thai and English Tesseract binaries, but no OCR feature is enabled yet.

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

render.yaml defines an app and PostgreSQL in Singapore. Import the repository as a Blueprint and supply LINE_LOGIN_CHANNEL_ID and LIFF_ID. Confirm both plans are free before creation. No paid upgrade is authorised.

The Docker startup runs migrations because a separate pre-deploy step may be unavailable on a free service.
The app must pass /ready. Set the LIFF endpoint to the public HTTPS root after deployment.

```powershell
node scripts/check-deployment.cjs https://YOUR-SERVICE.onrender.com
```

A successful local build is not a deployed service. Record the URL and executed live results separately.
Free services sleep when idle. Free PostgreSQL expires after 30 days. Record creation and expiry dates and export before expiry, then decide continuity before the provisional final deadline.
Use pg_dump/pg_restore with a secure environment or database client. Restore to a separate empty database and verify counts before relying on a backup.

Provider reference: https://render.com/docs/free (checked 24 September 2026).

## LINE setup

1. Create the LINE OA and enable Messaging API. Keep its provider ID.
2. Create LINE Login under the same provider, enable web app and add both test accounts as testers while the channel is in development.
3. Add a LIFF app with openid scope and the public HTTPS endpoint. Record the LIFF ID and Login channel ID in server configuration.
4. Open LIFF from each test account. Check that login alone creates no student record, grant creates one, and confirmed deletion removes it.
5. Chat identity parity, webhook signature validation and Rich Menu are the 27 September integration stage. Do not claim them from this consent screen.

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

Writing workflow YAML does not configure repository protection. Record remote evidence after authorised GitHub account access is available.
