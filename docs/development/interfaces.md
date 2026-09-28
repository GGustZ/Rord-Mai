# September 23–24 integration interfaces

Implementation owner for this session: AI-assisted work requested by Chavadol.
Frontend and engine foundation were authorised even where the original tracker assigned another member.
Teammates must reconcile these files before merging parallel work.

## Frontend

React in apps/web, real @line/liff SDK, same-origin REST calls.
LIFF obtains the raw ID token; Express verifies it with LINE for the configured Login channel.
The browser never supplies a student UUID and never saves the token in localStorage.
Implemented screens: consent, course list, create/join, varied grading structures, score/attendance entry and correction, target calculation, shared weight correction, and confirmed deletion. Chat implementation and Rich Menu assets were added on 27 September; live registration remains pending.

GET /api/config exposes only liffId and policyVersion.
GET /api/v1/consents does not create a student.
PUT /api/v1/consents grants storage with {storage:true,crossBorderExplanation:false,policyVersion}.
Withdrawal uses storage:false with confirmDeletion:true.
DELETE /api/v1/me/data requires JSON {confirmDeletion:true}, then returns 204.
This explicit request confirmation is an intentional contract amendment.
All private responses use Cache-Control: no-store.

## Engine

Pure CommonJS package at packages/engine; API adapter at apps/api/src/adapters/engine.js.
Input components: {id,weightPercent,maximumScore,score}; score:null means unrecorded.
Input gradingMode is criterion or norm. Criterion requires the seven ordered thresholds; norm requires null.
Adapter exports courseSummary(input) and targetCalculation(input,targetGrade).
No partial-score letter projection is invented: criterion projectedGrade stays null until all components are recorded, with INCOMPLETE_ASSESSMENTS.
Norm always returns NORM_REFERENCED and no letter grade.
The API routes now pass persisted data under a student lock and shared section lock. Weight updates take an exclusive section lock. Calculation responses carry structureRevision, and the frontend refuses to display mismatched detail/summary revisions.
This real small engine is temporary shared implementation, not yet Praweena's approved final engine.

## Repository and concurrency

withStorageConsent supplies the database student ID and transaction client after locking the student.
Every academic writer must await work using that same client and enforce resource ownership.
requireOwnedEnrollment hides another student's record with 404.
listOwnedEnrollments uses creation-time/UUID keyset pagination with an opaque cursor.
requireCurrentJob checks original student UUID and unexpired job existence. Workers must not revive stale work by resolving only the LINE user ID after a fresh consent grant.

Migration 003 adds deletion-linked private tables and nullable shared creator/revision attribution.
Migration 003 does not implement features by itself. The academic service implements attendance and grading corrections; chat now uses its conversation_state/private_jobs tables. Profile processing remains deferred. Migration 004 adds component order and an enrolment pagination index.
Foreign keys cascade private data on student deletion. Shared sections remain, with creator and revision actors cleared.
No identifiable deletion audit remains. Future writers and tables must extend deletion tests before becoming available.

## LINE chat, 27 September

POST /webhooks/line verifies HMAC-SHA256 over raw bytes before parsing, separately from LIFF bearer authentication. Invalid signatures return 401, malformed signed JSON returns 400, unavailable durable acceptance returns 503. Empty events supports provider verification. Non-text and non-private events are ignored. Both Messaging API variables must be present to enable chat; a partial pair stops startup.

Only consented direct-message text enters private_jobs, with webhookEventId uniqueness, original student UUID and 5-minute expiry based on event time. Events predating the current consent grant are ignored. Pre-consent replies link to LIFF without persisting identity/text/jobs. Raw webhook bodies are never stored. Text over 100 characters becomes help rather than truncated academic input.

The worker locks the original student before the job. It calls createAcademicService through an internal transaction-local consent adapter so all operations use the same client and lock. Score mutation, draft transition and line.reply status commit together. REST receives no transaction/bypass parameter.

Delivery uses the single-use reply token under the student lock, with a 5-second network timeout. Reply errors mark line.failed and erase the payload; no push fallback or mutation replay. A crash between commit and reply resumes delivery only. Receipt identifiers persist until expiry; older webhooks are then rejected. Infrastructure errors retain work for polling until expiry. Shutdown drains active work.

Commands: score/start, summary, courses/help, cancel. Numbered selections paginate in groups of eight with next. Drafts require confirm; edit returns to mark entry. Drafts expire after 15 inactive minutes. Late messages, changed scores and grading revisions cannot silently overwrite data. Attendance source changes require explicit removal in LIFF.

Jobs, drafts and receipts cascade on deletion. Expired records are removed when the worker runs; free-host sleep can delay physical cleanup until wake. The demo worker is sequential. Local adapter tests are not proof of LINE delivery.
