'use strict';
const messages = {
  JOIN_CODE_UNAVAILABLE: [503, "Could not create a join code. Please try again."],
  SECTION_NOT_FOUND: [404, "Section not found. Please check the code and try again."],
  ALREADY_ENROLLED: [409, "You are already enrolled in this section."],
  CREATOR_REQUIRED: [403, "Only the section creator can edit the shared grading structure."],
  ASSESSMENT_TYPES_REQUIRED: [409, "The creator must confirm assessment types before new entries."],
  ASSESSMENT_INPUT_TYPE_MISMATCH: [409, "Use the configured entry type for this assessment in LIFF."],
  REVISION_CONFLICT: [409, "The grading structure changed. Refresh and review it before saving."],
  NORM_GRADE_UNAVAILABLE: [422, "Letter-grade prediction and targets are unavailable for norm-referenced courses."],
  ATTENDANCE_SOURCE_EXISTS: [409, "Remove the attendance entry before recording raw marks."],
  SCORE_SOURCE_EXISTS: [409, "Remove the raw marks before recording attendance."],
  UNAUTHENTICATED: [401, "Sign in with a verified LINE identity."],
  IDENTITY_UNAVAILABLE: [503, "LINE identity verification is unavailable. Please retry."],
  VALIDATION_ERROR: [400, "Invalid or unsupported information. Please review your entries."],
  CONFIRMATION_REQUIRED: [400, "Confirm data deletion before withdrawing storage permission."],
  UNSUPPORTED_MEDIA_TYPE: [415, "Use Content-Type: application/json."],
  FEATURE_UNAVAILABLE: [409, "External explanation consent is unavailable in this version."],
  RESOURCE_NOT_FOUND: [404, "The requested information was not found."],
  DATABASE_UNAVAILABLE: [503, "The database is temporarily unavailable. Please retry."],
  PROFILE_REQUIRED: [409, "Save cumulative GPA and GPA-counted credits before comparing GPAX."],
  REPEAT_RULE_UNVERIFIED: [422, "The official repeat-course rule is unverified. GPAX for repeated courses remains unavailable."],
  TARGET_REQUIRED: [409, "Save a target grade before requesting an explanation."],
  OCR_UNAVAILABLE: [503, "Syllabus recognition is unavailable. Enter the structure manually."],
  OCR_BUSY: [503, "Another image is being processed. Please retry shortly."],
  EXTRACTION_FAILED: [422, "No usable assessment rows found. Try a clearer image or enter them manually."],
  IMAGE_REQUIRED: [415, "Upload one valid PDF, PNG or JPEG syllabus."],
  IMAGE_TOO_LARGE: [413, "Use a file no larger than 5 MiB and an image no larger than 10 million pixels."],
  PDF_TOO_MANY_PAGES: [413, "Use a PDF with at most 8 pages."],
};
const fail = (code) => {
  const [status, message] = messages[code];
  return Object.assign(new Error(message), { status, code });
};
module.exports = { messages, fail };
