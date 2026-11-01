# Participant UAT protocol

QA-06 preparation, 30 October 2026. QA-07 is **not run** until real 5–8 DME students have participated. Automated browser tests are separate evidence.

## Before the first session

Record candidate revision/build identifier, deployed URL, date and time in Asia/Bangkok, device/OS, facilitator and observer. Use the same candidate for every participant; record any fix and exclude mixed-release totals. Assign P01–P08 without collecting names, student IDs, grades or LINE identifiers in the results sheet. Use agreed test accounts and fictional course data. Keep recruitment/contact details outside the project repository.

Read this consent script before testing:

> เราขอให้คุณทดลองใช้รอดมั้ยด้วยข้อมูลการเรียนสมมติประมาณ 15–20 นาที เพื่อดูว่างานใดทำได้ด้วยตนเองและติดขัดตรงไหน การเข้าร่วมเป็นความสมัครใจ คุณหยุดหรือข้ามงานได้ทุกเมื่อโดยไม่เสียสิทธิ์ เราจะจดเฉพาะรหัสผู้เข้าร่วม ผลการทำงาน และข้อสังเกต โดยไม่จดชื่อ รหัสนักศึกษา หรือข้อมูลการเรียนจริง การบันทึกภาพหรือเสียงต้องขอความยินยอมแยกต่างหาก คุณยินยอมเข้าร่วมการทดสอบหรือไม่

Record consent yes/no and time before beginning. No consent means no session data. Do not record a phone screen, account identifier or voice without separate explicit recording consent. Honor requests to stop; remove the participant's notes if requested before anonymised aggregation. Delete test academic data through the application after the session. Team must confirm notice, responsible contact, actual hosting destinations and a retention/deletion date before recruitment.

## Standard tasks

Give only the task instruction first. Record start/end times and first failure step. After two minutes stuck on a task, ask whether the participant wants a hint or to stop; log the hint and classify completion as assisted. Explanations of what to click count as help.

| Task | Instruction to participant | Observer acceptance |
|---|---|---|
| T1 | Agree to storage, then continue without AI explanations. | Two separate choices; core course screen works; external consent remains off. |
| T2 | Create a fictional 3-credit course with two exams weighted 40% and 60%, and grade A at 80%. Try a 95% total first. | Save is blocked until total is 100%; data persists once; participant understands the missing 5%. |
| T3 | Try code ZZZZZZ, then join the facilitator's section using its correct code. | Clear Thai error; shared structure appears; no facilitator scores are visible. |
| T4 | Record 80/100 in the 40% exam and set target A. | Weighted points 32; evaluated weight 40%; remaining score requirement 80%. Saved zero and unrecorded are distinguishable. |
| T5 | On a separate one-course test account, save GPA 3.00 and 30 counted credits, assume A for the 3-credit course, then compare staying and withdrawal. | Staying 102/33 ≈ 3.09; withdrawal 3.00; delta ≈ -0.09. Participant locates disclaimer and four non-GPAX considerations. |
| T6 | Ask for a Thai explanation while AI consent is off. | Complete template explanation; no loss of core functionality. Record comprehension in the participant's own words without leading them. |
| T7 | If the agreed syllabus image set is available, read a sample image, correct a value and confirm the draft. Otherwise enter the same structure manually. | Nothing is stored before final confirmed creation; manual entry succeeds independently. Report which path was used. |
| T8 | In the approved LINE test chat, enter and confirm a score using quick replies, then read it in LIFF. | Score is not written before confirmation; same saved value appears in both channels. This requires real LINE, not a browser identity substitute. |
| T9 | Delete the participant's saved data after reading the confirmation. | Explicit confirmation required; private views disappear; facilitator's shared section and separate scores remain. |

T5 needs a separate account because GPAX scenarios cover every enrolled course. Never conceal other enrolled courses merely to obtain the example number. Notifications belong to the controlled deployed system test; do not send unsolicited notifications to participants.

## Recording and metrics

Use `uat-results-template.md`. Per task record attempt number, duration, unaided/assisted/failed/skipped, first failing step, hint and observation. Record visits, attempts and successful checks separately. An opened screen is not a completed task. Avoid inferring learning or mastery.

Report unaided successes / actual participants who attempted that task, assisted completions separately, and failure-step counts. Exclude not-run and skipped tasks from the attempt denominator; show their counts explicitly. Do not prefill participant results. Any release-blocking privacy, identity or numerical error prevents a successful release claim even if most tasks pass.
