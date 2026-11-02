# Reference UI journey

The supplied Stitch exports in the paired Context assets folder define the 18-screen visual reference. Application navigation, validation and notification copy use English. Thai explanations, user-entered text and Thai syllabus recognition remain supported.

## Flow and contracts

- Onboarding: storage permission → optional external-AI permission → academic profile → setup summary. A saved academic profile completes onboarding. Returning profiles open the workspace; missing profiles resume the optional-AI/profile steps. Storage and AI choices remain independent.
- `GET /api/v1/me/profile` keeps its existing shape. `PUT /api/v1/me/profile` accepts required `academicYear` and `semester`, plus `currentGpa` and `creditsCounted` that are either both valid numbers or both `null`. Blank UI inputs become null, never an invented zero GPA. Term-only profiles cannot calculate GPAX (`PROFILE_REQUIRED`).
- `POST /api/v1/sections/preview`, body `{ "joinCode": "A7K2PQ" }`, requires verified LINE identity and current storage permission. It returns `{data:{section,enrollmentId}}`. The section contains shared grading data, excluding ownership flags, creator identity and private entries. `enrollmentId` is null or belongs to the requester. Code normalization and validation match the existing join endpoint. Preview creates no enrollment.
- `POST /api/v1/sections/join` remains the only join write. Confirmation happens after preview. An already-enrolled preview opens the requester's own course. Existing section-ID reads remain membership protected.
- OCR accepts one PNG/JPEG screenshot or PDF within the documented limits. Upload → editable review → confirmation updates only the creation draft. Final section creation is the persistence boundary. Chat attachments return rows for manual entry. No confidence score is implied.
- Course and GPAX notification links use `view=course|gpax&enrollmentId=<uuid>`. They are processed after LIFF initialization and authorized using protected enrollment reads. LINE-reserved query parameters are preserved.
- Score and attendance tabs list only assessments configured for the respective type. Legacy/unclassified or incompatible records retain the existing creator-classification and manual-removal safeguards.
- The share control runs only after a click, uses the platform share sheet when available, and falls back to clipboard. No automatic LINE message is sent.

## Migration and notification compatibility

Migration `007_reference_journey` permits paired-null profile baselines and adds nullable `deadline_notifications.message_payload`. Existing numeric profiles and text reminders remain valid. New notifications persist the complete Flex payload before delivery and reuse it and the retry key across retries. Eligibility, Bangkok cutoff, consent locking, cancellation, three-attempt limit and existing deduplication are unchanged.

Rollback refuses term-only profiles and pending Flex payloads instead of losing or inventing data. Resolve those records deliberately before rollback. Run migration against a backed-up deployment only as a separate authorized release action; this implementation was tested on a disposable database.

## Visual adaptations

- Reference HTML is design material, not production runtime. The app uses React, local CSS/SVG icons, and a self-hosted Inter font with its bundled license; no Tailwind/font CDN is loaded.
- Green action fills and the orange alert header are darkened slightly to maintain readable white text. Supporting text and touch controls are larger where necessary. The supplied RordMai mark replaces the illustrative logo from the discarded generated concept.
- Prototype state galleries become conditional states. Sample grades, department labels, OCR confidence and attendance-eligibility claims are not fabricated.
- LINE alert contents are implemented as a Flex message. Native LINE chat chrome is owned by LINE; a local layout preview is not device-delivery evidence.
- GPAX, privacy/deletion and creator correction remain available with the reference visual treatment. Fictional-data and hosting disclosures remain visible.

## Local validation

Use a newly created disposable `rordmai_test` database. Integration and browser fixtures truncate records; never point `TEST_DATABASE_URL` at an existing application database. Standard checks are `npm run check`, `npm run test:integration`, and `npm --prefix apps/web run test:browser`. Set `BROWSER_CHANNEL=msedge` when using the installed Edge browser locally.

See the Context UI verification report for measured results and screenshots. Deployment, real LINE sends, provider acceptance and participant UAT are separate gates.
