# API-01: REST contract v1

Status (30 October 2026): identity, consent/deletion, persisted academic operations, profile access, repeat metadata, ordinary GPAX scenarios, signed chat with native quick replies, Thai explanations and image-only syllabus draft extraction are implemented locally. Native Thai/English OCR with networking disabled, Docker build and local container startup have been checked for this candidate. Real LINE delivery, real Gemini behavior, same-release public deployment and team review remain separate acceptance gates. Repeated-course GPAX stays disabled pending the official rule. See docs/development/interfaces.md for the current handoff.

## Transport and identity

Base path: /api/v1. HTTPS is required outside local development. JSON bodies use Content-Type: application/json and are limited to 100 KiB. JSON primitives and arrays are syntactically valid but invalid for object request schemas. Unknown input fields are rejected. No implicit conversion of numeric strings.

Protected requests carry Authorization: Bearer <LIFF ID token>. The backend verifies the raw token through LINE's ID-token endpoint for the expected Login channel before deriving identity. Never accept student identity from body fields or a decoded client profile. All application routes below require that identity, including consent routes. GET /health, /ready and /api/config are public. CORS is not authentication. The LINE webhook uses separate signature verification and is outside this REST contract.

Use UUID strings for internal IDs. Dates are YYYY-MM-DD calendar dates in Asia/Bangkok; timestamps are UTC ISO 8601. Deadline alerts stop at the end of the specified Bangkok date, before the following midnight. All numbers must be finite. Missing fields differ from explicit null.

Success: {"data": <documented result>}. DELETE returning 204 has no body.
Error: {"error":{"code":"VALIDATION_ERROR","message":"Human-readable message","details":[{"path":"components.0.name","message":"Required"}]}}. details is optional. No stack traces or raw payloads in responses. Clients branch on code.

Common failures: 400 INVALID_JSON or VALIDATION_ERROR; 401 UNAUTHENTICATED; 403 STORAGE_CONSENT_REQUIRED; 404 RESOURCE_NOT_FOUND (also for another student's private resources); 409 CONFLICT; 413 PAYLOAD_TOO_LARGE; 415 UNSUPPORTED_MEDIA_TYPE; 500 INTERNAL_SERVER_ERROR. Unknown paths use 404 ROUTE_NOT_FOUND. Unimplemented features must never return success.

## Shared types

- SectionInput: courseCode (trimmed string 1..30), courseName (1..200), sectionNumber (1..20), academicYear (Gregorian integer 1..9999), semester (1,2,3), credits (positive safe integer), gradingMode (criterion|norm), withdrawalDeadline (real date), gradeThresholds, components (1..30).
- ComponentInput: name (trimmed 1..100), weightPercent (>0..100, at most two decimal places), maximumScore (>0), inputType (required marks|attendance). Weights total 100 using integer hundredths. Component: ComponentInput plus id UUID; existing assessments can return inputType:null until their creator classifies them. Never infer type from a name or existing entry.
- gradeThresholds: criterion requires exactly A,B+,B,C+,C,D+,D numeric minima in [0,100], strictly decreasing; values below D yield F. Norm requires null. These are supplied course rules, not universal university thresholds.
- Section: SectionInput with components replaced by Component[], plus id, joinCode (six uppercase ASCII letters/digits), structureRevision (positive integer), and canEdit (whether the verified caller is the creator). Server generates IDs and codes. Code collisions retry at most five times; exhaustion returns 503 JOIN_CODE_UNAVAILABLE. Codes are not credentials.
- AcademicProfile: currentGpa (0..4), creditsCounted (integer 0..2147483647), academicYear (1..9999), semester (1,2,3). If creditsCounted is zero, currentGpa must be zero. Count credits already included in the reported cumulative GPA, not just passed credits. Inputs are self-reported; the rounded reported GPA makes projections estimates. The earlier unimplemented creditsEarned profile contract is superseded; migration 006 renames the existing column without changing values.
- Enrollment: id, sectionId, targetGrade (A|B+|B|C+|C|D+|D|null), repeat (null or {previousGradePoint: 0..4}). Repeat grade points must belong to the engine's agreed grade-point scale. Return the same fields on reads; no student identifier is necessary.
- Score: componentId, score (0..component.maximumScore), updatedAt. Absence of a record means unrecorded; zero is a recorded zero. One score per enrollment/component.
- Attendance: componentId, attended (nonnegative integer), totalSessions (positive integer), updatedAt; attended <= totalSessions. New attendance entries require inputType:attendance; marks entries require inputType:marks. Entries require every assessment in the section to have a confirmed type. Existing incompatible entries remain visible and count in calculations until explicitly cleared; they cannot be replaced with the other source without deletion.
- Consent: storage, crossBorderExplanation (independent booleans), policyVersion (current policy string), acceptedPolicyVersion (string|null), updatedAt (timestamp|null). External explanation consent defaults false and requires storage consent. Storage-only reacceptance preserves current external evidence, but a policy-version change invalidates the older external choice. Independent external updates lock the student and cannot recreate a deleted identity. The original combined endpoint remains compatible. Granting it does not enable account-wide transfers; only the allowlisted computed explanation payload is eligible. Missing Gemini configuration uses local templates even when consent is granted.
- Page<T>: {items:T[], nextCursor:string|null}. List query: limit integer 1..100, default 20; optional opaque cursor. Stable order by creation time and ID. Invalid cursor returns 400.

## Endpoints

All paths below are relative to /api/v1, except /health. Empty request means no body or query beyond listed pagination. All listed success shapes appear inside data.

| Method and path | Request | Success | Additional failures |
|---|---|---|---|
| GET /health (unprefixed) | Empty | 200 {status:"ok",service:"rord-mai-api"} | Checks HTTP process only |
| GET /consents | Empty | 200 Consent; absent consent returns false flags and updatedAt:null | 401 |
| PUT /consents | {storage:boolean,crossBorderExplanation:boolean,policyVersion:string,confirmDeletion?:boolean} | 200 Consent | 409 POLICY_VERSION_OUTDATED; storage:false requires confirmDeletion:true and crossBorderExplanation:false |
| PUT /consents/storage | {storage:boolean,policyVersion:string,confirmDeletion?:boolean} | 200 Consent | storage:true preserves the current external choice; a new student defaults external consent off; storage:false requires confirmDeletion:true and deletes private data |
| PUT /consents/cross-border-explanation | {crossBorderExplanation:boolean,policyVersion:string} | 200 Consent | 403 without existing storage consent; 409 for obsolete accepted/current policy; never creates a student or changes storage consent |
| GET /me/profile | Empty | 200 AcademicProfile | 404 if absent |
| PUT /me/profile | AcademicProfile | 200 AcademicProfile | 403 without storage consent |
| DELETE /me/data | {confirmDeletion:true} | 204, idempotent | Deletes academic data and consent state; subsequent access requires fresh consent; absent confirmation returns 400 |
| POST /sections | SectionInput | 201 {section:Section,enrollment:Enrollment}; Location points to /api/v1/sections/{id} | 403; creates creator enrollment atomically |
| POST /sections/join | {joinCode:string}; trim and uppercase, six ASCII alphanumerics | 201 Enrollment | 404 SECTION_NOT_FOUND; 409 ALREADY_ENROLLED |
| GET /sections/{sectionId} | UUID path parameter | 200 Section | Only section members may read |
| GET /enrollments | Optional limit,cursor | 200 Page<Enrollment> | Own enrollments only |
| GET /enrollments/{enrollmentId} | UUID path parameter | 200 {enrollment:Enrollment,section:Section,scores:Score[],attendance:Attendance[]} | Ownership enforced |
| PATCH /enrollments/{enrollmentId} | Nonempty object with targetGrade and/or repeat; repeat:null or {previousGradePoint:0|1|1.5|2|2.5|3|3.5|4} | 200 Enrollment | 422 NORM_GRADE_UNAVAILABLE if non-null target for norm grading; repeat calculations remain blocked |
| PUT /enrollments/{enrollmentId}/scores/{componentId} | {score:number} | 200 Score (idempotent upsert) | 400 if component outside section or score out of range; 409 ATTENDANCE_SOURCE_EXISTS |
| DELETE /enrollments/{enrollmentId}/scores/{componentId} | Empty | 204; resets to unrecorded | Validate ownership and component membership |
| PUT /enrollments/{enrollmentId}/attendance/{componentId} | {attended:integer,totalSessions:integer} | 200 Attendance | 409 SCORE_SOURCE_EXISTS |
| DELETE /enrollments/{enrollmentId}/attendance/{componentId} | Empty | 204 | Validate ownership and component membership |
| GET /enrollments/{enrollmentId}/summary | Empty | 200 CourseSummary | Engine output only |
| POST /enrollments/{enrollmentId}/target-calculation | {targetGrade: grade letter except F} | 200 TargetResult; calculation does not save target | 422 NORM_GRADE_UNAVAILABLE |
| POST /gpax/scenarios | {scenarios:Scenario[]} with 1..20 unique labels | 200 {results:GpaxResult[],comparison:GpaxComparison|null} | 409 PROFILE_REQUIRED; 422 REPEAT_RULE_UNVERIFIED |
| POST /enrollments/{enrollmentId}/explanation | {kind:"summary"|"target"|"withdrawal"}; withdrawal also requires scenarios; target requires saved target | 200 {text:string,source:"template"|"llm"} | 409 TARGET_REQUIRED or PROFILE_REQUIRED; invalid LLM output falls back to template |
| POST /ocr/syllabus | multipart field image, one JPEG/PNG up to 5 MiB and 10 megapixels; validate file contents; no PDF | 200 OcrDraft | 413 IMAGE_TOO_LARGE; 415 IMAGE_REQUIRED; 422 EXTRACTION_FAILED; 503 OCR_BUSY or OCR_UNAVAILABLE |

Section creation automatically enrolls its creator. Multiple user-created sections for the same course/semester are permitted; courseCode alone is not a unique key. PATCH /sections/{sectionId}/grading-structure is creator-only and accepts {expectedRevision,components:[{id,weightPercent,inputType?}]} containing every existing component exactly once. Omitted inputType retains a confirmed type for older weight-only clients; unclassified sections require all missing types to be supplied. Total must be exactly 100 in integer hundredths; creation and revision return an explanatory components detail naming the shortfall or excess; stale revisions return 409. Success returns the updated Section including structureRevision. Revision history records both weights and types. Scores, attendance and component IDs remain unchanged. Adding/removing components, changing maximum marks or grading mode is excluded. Legacy sections with no creator remain read-only. Summary and target responses also include structureRevision.

Migration 005 adds nullable components.input_type without backfilling guesses or modifying academic entries. A PUT to either entry endpoint returns 409 ASSESSMENT_TYPES_REQUIRED if any assessment remains unclassified, or 409 ASSESSMENT_INPUT_TYPE_MISMATCH for the wrong method. Existing source conflicts continue to use ATTENDANCE_SOURCE_EXISTS or SCORE_SOURCE_EXISTS. DELETE remains available for unclassified and incompatible entries. Creator classification can preserve mismatched entries, so LIFF shows a correction notice and blocks saving until the student explicitly clears them. LINE chat records marks only; attendance, unclassified assessments and incompatible old attendance entries direct the student to LIFF.

Confirmed storage withdrawal through PUT /consents/storage or legacy PUT /consents performs the same deletion as DELETE /me/data. The demo retains no identifiable consent audit after deletion. Student-linked scores, enrolments, profiles, attendance, conversation state, private jobs and deadline notification records are deleted. Shared structures remain without creator or revision-actor attribution, with no automatic ownership transfer. Initial decline makes no API write. All academic writers and deletion lock the same student row. Explanation payloads exclude identity, section IDs, labels and raw scores. OCR produces a draft only; confirmation uses regular section creation. Running OCR inside an overseas container does not satisfy the original Thailand-only deployment requirement.

## Explanation, OCR and notification behaviour

Explanation input uses persisted owned data under the student lock. Summary/target templates work without an external model. Withdrawal input contains two complete scenarios, ordered stay then withdraw, differing only in the selected enrollment. Generated output must contain every allowlisted metric placeholder and no literal numbers; unknown placeholders, malformed output, provider errors or a five-second timeout use the template. Model wording remains plain text and an estimate disclaimer is appended. Verification protects numeric values, not general linguistic accuracy.

OCR is consent-checked before upload and before returning the draft. Only validated single-frame JPEG/PNG is decoded. One process runs per application instance; native Tesseract has a 30-second timeout and temporary files are removed on all exits. The initial parser reads explicit percentage rows and warns about gaps/ambiguity. Draft maximum marks default to 100 and input type to marks, with explicit correction warnings. These are editable placeholders, not inferred facts. User review plus a 100-percent total is required before the draft is used. Neither upload nor extraction creates database records.

Deadline evaluation is hourly via the separate Node command and GitHub Actions workflow. It rechecks active consent, the original student UUID, saved criterion target, current entries and deadline before each send. One durable record per student UUID/section stores the original body and retry key; attempts are persisted before network delivery. At most three attempts use delays of one and five minutes; permanent failures, changed eligibility and the deadline stop retrying. A verified LINE duplicate response counts as accepted. Deletion removes queued notification state. A fresh consent creates a new student record and cannot revive old work. Logs contain counts only. Accepted provider requests are not proof of phone delivery; scheduling is best effort.

## Calculation result definitions

### LINE transport (outside /api/v1)

POST /webhooks/line accepts LINE Messaging API event batches with x-line-signature. HMAC-SHA256 verification uses the original raw bytes before JSON parsing. Empty events returns 200 for provider verification. Invalid/missing signature returns 401, malformed signed JSON returns 400, and durable-acceptance failure returns 503. Successful intake returns 200 after jobs are committed; it does not imply a score has been confirmed or a reply delivered.

Only direct user text is processed. Consentless users receive a LIFF link without persistent academic input. Consentless reminder delivery starts after HTTP acknowledgement and remains request-local. Database acceptance and cold starts can still delay acknowledgement; measure the subsecond requirement on the deployed host. Consented jobs deduplicate webhookEventId, expire after five minutes and retain the original student UUID. Chat drafts expire after 15 inactive minutes. The confirmation operation reuses the academic writer and cancels when the selected revision or score changed. Both channels preserve ownership, consent and attendance-source rules. See ../development/interfaces.md for worker and deletion semantics.

### REST calculation results

CourseSummary = {currentWeightedScore:number, gradedWeightPercent:number, remainingWeightPercent:number, maximumPossibleScore:number, gradingMode, projectedGrade:grade|null, projectionAssumption:string|null, reasonCode:string|null}.
Weighted score is percentage points, not the average over graded components. gradedWeightPercent + remainingWeightPercent = 100. Predictions must name the remaining-performance assumption. Norm mode always has projectedGrade:null and reasonCode:"NORM_REFERENCED". The engine owns every numeric result.

TargetResult = {targetGrade, targetThreshold:number, currentWeightedScore:number, remainingWeightPercent:number, requiredRemainingPercent:number|null, reachable:boolean, reasonCode:"ALREADY_ACHIEVED"|"REACHABLE"|"EXCEEDS_MAXIMUM"|"NO_REMAINING_WEIGHT"}. Required percent is the average required across all remaining weight. Already achieved gives zero. No remaining weight gives null, never division by zero. Values greater than 100 are retained and marked unreachable.

Scenario = {label:string (1..80), outcomes:[{enrollmentId:UUID, outcome:"grade", grade:grade including F} OR {enrollmentId:UUID,outcome:"withdraw"}]}. Include each current enrollment exactly once, no duplicates. The server obtains credits, current GPA, and repeat metadata from owned records; clients cannot override them in calculation requests.

GpaxResult = {label, gpax:number|null, qualityPoints:number, creditsCounted:number, appliedRepeatRule:string|null, assumptions:string[], disclaimer:string}. Zero denominator gives gpax:null. A paired stay/withdraw comparison uses two scenarios differing only in the selected enrollment. Never substitute an unverified repeat rule; return REPEAT_RULE_UNVERIFIED. GpaxComparison = {stay:number|null,withdraw:number|null,delta:number|null}, with delta = withdraw − stay, from the pure engine helper. It is returned only for two complete ordered scenarios differing in exactly one grade-to-withdraw outcome; otherwise comparison is null. If either GPAX is null, delta is null. Both scenario GPAX values are returned for comparison; explanations include lost credits, transcript W, prerequisites, offering frequency, and advisor discussion without recommending withdrawal.

OcrDraft = {components:ComponentInput[], warnings:string[], requiresConfirmation:true}. OCR never creates a section, enrollment, or score.

## Responsibility and completion

API-01: conventions about years, semester 3, integer credits, 30 components and creator enrollment are explicit pilot decisions. Creator weight revision and confirmed deletion supersede the earlier immutable-structure and empty-deletion-request proposals. Team reconciliation remains required.
API-02: HTTP application/server separation, routing, JSON parsing, create/join validation, consistent errors, configurable port, and regression tests. Future feature implementation belongs to API-03 onward, data migrations to DAT-02, identity integration to LINE work, and CI to INF-05. Do not mark those tasks done from passing skeleton tests.
