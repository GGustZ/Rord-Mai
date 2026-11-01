# Rord-Mai: academic progress and withdrawal scenario comparison

Final-report candidate, 30 October 2026. Team: Chavadol Larat, Praweena Bunkham and Chuttiyaporn Pakdeeyut. **Participant UAT and same-release production acceptance are pending. This document must be completed with observed results before final submission.**

## Problem and objectives

Students need to combine assessment weights, recorded scores, remaining work and cumulative GPA when considering academic options. Rord-Mai presents these calculations inside LINE, with explicit assumptions and non-GPAX considerations. It supports decisions with estimates and does not recommend withdrawal or predict an official grade.

The core objective is an authenticated workflow for shared course setup, private score/attendance entry, required-score calculation and paired stay/withdraw GPAX comparison. Manual setup and deterministic Thai explanations keep the application usable without OCR or a language model.

## Implemented system

The four layers are the LIFF/chat client, LINE platform, application container and PostgreSQL data layer. The application separates Express identity/validation, consent-locked services, parameterised persistence and a pure calculation engine. See `architecture.md` for the implemented diagram and `api/contract.md` for interfaces.

Students choose storage and external explanations separately. Course structures are shared while academic entries remain private. Confirmed deletion removes private records and clears attribution without destroying classmates' shared structure. The data inventory lists every stored field and the remaining hosting-policy questions.

The 30 October candidate adds explicit weight shortfall/excess messages on creation and correction, separate consent endpoints with compatibility for the old route, post-acknowledgement consent reminders, a Recharts comparison, engine-produced numeric delta, a withdrawal-considerations panel, a separate optional second consent screen and Thai interface copy. HTTP verification tests use the production token verifier with controlled provider responses.

## Calculation example

For an 80/100 exam weighted 40%, current weighted points are `80/100 × 40 = 32`. Reaching an 80-point target with 60% remaining requires `(80 − 32)/60 × 100 = 80%` in the remaining work.

With cumulative GPA 3.00 over 30 counted credits and one assumed A in a 3-credit course, staying gives `(3 × 30 + 4 × 3)/(30 + 3) = 102/33 ≈ 3.09`. Withdrawal gives `90/30 = 3.00`; withdrawal minus staying is approximately `−0.09`. Full precision is preserved until display. These are fictional assumptions. A zero denominator produces no calculable GPAX.

## Verification method and results

Local verification uses API/HTTP tests, pure-engine boundary tests, a separate disposable PostgreSQL cluster, and phone/desktop browser tests with controlled LINE identity and native-OCR adapters. Controlled-provider tests are not live LINE/Gemini acceptance. Final counts and execution outcomes are recorded in the dated release evidence, `testing/release-2026-10-30.md`.

The deployed system test must use one published candidate and two real approved test accounts: create, join, record, calculate, compare, receive a notification, withdraw consent and delete. Record URL, build identifier, device, time and outcomes. **Observed result: not recorded for this candidate.**

## Participant UAT

Protocol: `testing/uat-protocol.md`. Observation template: `testing/uat-results-template.md`. Recruit 5–8 DME students with informed voluntary participation, fictional data and anonymised participant IDs. Record unaided success, assisted completion, attempts, duration and first failure step separately.

**Actual participants: not recorded. Task completion rates, failure frequencies, quotations and usability conclusions: not available.** Browser automation does not fill this evidence gap. Insert the actual observations and derived task denominators here after QA-07; do not convert planned participants into completed sessions.

## Limitations and remaining acceptance

Repeated-course GPAX is intentionally unavailable pending confirmation of the applicable official university rule. Previous-grade metadata is stored but does not establish grade-replacement behavior. A 2565 undergraduate regulation was located on an official KKU domain as a research candidate; applicability and the exact operative rule have not been established: https://iad.kku.ac.th/file/Announcement/Undergraduates_Regulations_2565_TH.pdf.

Free hosting may sleep, affecting cold-start and scheduled timing. Durable database acceptance can delay webhook acknowledgement, so the literal subsecond claim requires live measurements. Real LINE login, quick replies, Rich Menu registration, phone receipt, scheduling, current hosting configuration, branch protection, clean-machine setup and team review remain evidence gates.

OCR supports reviewed PNG/JPEG drafts, not PDF, and five real KKU syllabus photographs still require assessment. Gemini output uses trusted numeric placeholders and fallback but can still contain unsuitable language. Thai copy needs review by a person who did not write the screens. No generalisation or user-satisfaction claim is supported until UAT occurs.

## Conclusion

The candidate implements the main calculation and consent workflows and provides local verification evidence. Release acceptance depends on the same-release production test, real provider/container evidence and participant UAT. The final submission must distinguish working local behavior, observed deployed behavior and unresolved limitations.
