# LINE presentation release setup

## Accounts and deployment

1. Sign in to LINE Developers and Render. Keep credentials in `.env` or provider environment settings, never in commits or slides.
2. Use the same provider for Messaging API and LINE Login. Verify the explicit **Linked LINE Official Account** selection. Add two distinct LINE users as developers/testers while the channel is Developing. Two email addresses alone are not two LINE users.
3. Deploy `render.yaml` from the repository. Confirm free app/database plans and Singapore region. Set DATABASE_URL, LINE_LOGIN_CHANNEL_ID, LIFF_ID, STORAGE_POLICY_VERSION, LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN. No billing upgrade is authorised.
4. Set the LIFF endpoint to the deployed HTTPS root and enable `openid`. Set the webhook to `https://YOUR-SERVICE.onrender.com/webhooks/line`. Use Verify, then enable webhook delivery and redelivery. Disable conflicting automatic replies if needed for the demonstration.
5. Run `node --env-file=.env scripts/check-deployment.cjs https://YOUR-SERVICE.onrender.com`. This sends health/config/anonymous requests and a signed empty verification event, not academic messages.

## Rich Menu

`rich-menu.svg` is editable; `rich-menu.png` is the 2500 x 843 upload image. Actions: My courses opens LIFF, Enter score sends `score`, My summary sends `summary`.

Preview without changing LINE:

```powershell
node --env-file=.env scripts/line-rich-menu.cjs
```

Register the image and select the default menu for the configured OA:

```powershell
node --env-file=.env scripts/line-rich-menu.cjs --apply
```

Registration reuses a matching named menu and never deletes older menus. Verify the returned default menu ID and actual phone actions. Per-user menu assignments can override the default.

## Real-phone gate

- A opens LIFF from the menu, grants consent and creates a 40/60 section. B joins using their own account.
- A chooses Enter score, course, Midterm, 80, confirm. Verify 80 and 32 weighted points in A's LIFF, without changing B's marks.
- B records 60. A corrects weights to 30/70. Raw marks stay 80/60; points become 24/18. A's target of 80 requires 80% on remaining work.
- Correct A's score in LIFF and use summary in chat. Recover from an invalid score; reject a 90% weight total. Show norm grading without a letter prediction.
- Confirm withdrawal for A. Private marks/drafts/jobs disappear. B retains 18 points and the shared section without creator attribution.

## Recovery and evidence

Render documentation checked on 27 September says free services sleep after 15 idle minutes and may take about a minute to wake; free PostgreSQL expires 30 days after creation. Record the actual database creation/expiry dates and export date during setup. A warm-up is not proof of an always-on service.

Before presenting, open `/ready` until healthy, open LIFF and start a new chat. If no reply arrives, inspect LIFF before retrying the score. Reply expiry never triggers a push. Keep a labelled recorded backup; local test identities do not prove real LINE login.

Use `pg_dump --format=custom` with connection details supplied through private PostgreSQL environment variables. Restore with `pg_restore --no-owner --no-privileges` into a separate empty database, compare counts and verify a known calculation. Never restore over the live database as a test. Export before expiry.

Sources: [LINE signatures](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/), [webhook redelivery and ordering](https://developers.line.biz/en/docs/messaging-api/receiving-messages/), [Render limits](https://render.com/docs/free).
