# September 23–24 integration interfaces

Implementation owner for this session: AI-assisted work requested by Chavadol.
Frontend and engine foundation were authorised even where the original tracker assigned another member.
Teammates must reconcile these files before merging parallel work.

## Frontend

React in apps/web, real @line/liff SDK, same-origin REST calls.
LIFF obtains the raw ID token; Express verifies it with LINE for the configured Login channel.
The browser never supplies a student UUID and never saves the token in localStorage.
Implemented screens: consent, own enrolment empty/list state, confirmed withdrawal and deletion.
Course creation, scores and Rich Menu are later daily stages.

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
The API routes must pass persisted, consistently read data when calculation integration begins.
This real small engine is temporary shared implementation, not yet Praweena's approved final engine.

## Repository and concurrency

withStorageConsent supplies the database student ID and transaction client after locking the student.
Every academic writer must await work using that same client and enforce resource ownership.
requireOwnedEnrollment hides another student's record with 404.
listOwnedEnrollments uses creation-time/UUID keyset pagination with an opaque cursor.
requireCurrentJob checks original student UUID and unexpired job existence. Workers must not revive stale work by resolving only the LINE user ID after a fresh consent grant.

Migration 003 adds deletion-linked private tables and nullable shared creator/revision attribution.
It does not implement profile, attendance, chat processing or grading corrections by itself.
Foreign keys cascade private data on student deletion. Shared sections remain, with creator and revision actors cleared.
No identifiable deletion audit remains. Future writers and tables must extend deletion tests before becoming available.

