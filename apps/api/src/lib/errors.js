'use strict';
const messages = {
  JOIN_CODE_UNAVAILABLE: [503, 'Could not allocate a join code. Please retry.'],
  SECTION_NOT_FOUND: [404, 'No section matches this join code.'],
  ALREADY_ENROLLED: [409, 'You already joined this section.'],
  CREATOR_REQUIRED: [403, 'Only the section creator may edit the shared grading structure.'],
  ASSESSMENT_TYPES_REQUIRED: [409, 'The section creator must confirm assessment types before new entries can be saved.'],
  ASSESSMENT_INPUT_TYPE_MISMATCH: [409, 'Use the entry method configured for this assessment. Open the assessment in LIFF.'],
  REVISION_CONFLICT: [409, 'The grading structure changed. Reload and review before saving.'],
  NORM_GRADE_UNAVAILABLE: [422, 'Norm grading cannot predict a letter grade or grade target.'],
  ATTENDANCE_SOURCE_EXISTS: [409, 'Remove the attendance entry before entering raw marks.'],
  SCORE_SOURCE_EXISTS: [409, 'Remove the raw score before entering attendance.'],
  UNAUTHENTICATED: [401, 'Verified LINE identity is required.'],
  IDENTITY_UNAVAILABLE: [503, 'LINE verification is unavailable. Please retry.'],
  VALIDATION_ERROR: [400, 'The request contains invalid or unsupported fields.'],
  CONFIRMATION_REQUIRED: [400, 'Confirm deletion before withdrawing storage consent.'],
  UNSUPPORTED_MEDIA_TYPE: [415, 'Use application/json.'],
  FEATURE_UNAVAILABLE: [409, 'External explanation consent is not available in this release.'],
  RESOURCE_NOT_FOUND: [404, 'The requested resource does not exist.'],
  DATABASE_UNAVAILABLE: [503, 'The database is temporarily unavailable.'],
  PROFILE_REQUIRED: [409, 'Save your cumulative GPA and counted credits before calculating GPAX.'],
  REPEAT_RULE_UNVERIFIED: [422, 'The official repeat-course rule has not been verified. Repeat GPAX calculations are unavailable.'],
  TARGET_REQUIRED: [409, 'Save a target grade before requesting a target explanation.'],
  OCR_UNAVAILABLE: [503, 'Syllabus recognition is unavailable. Enter the grading structure manually.'],
  OCR_BUSY: [503, 'Another syllabus is being read. Please retry shortly.'],
  EXTRACTION_FAILED: [422, 'No usable grading table was found. Try a clearer image or enter the structure manually.'],
  IMAGE_REQUIRED: [415, 'Upload one valid PNG or JPEG image. PDF and other formats are not supported.'],
  IMAGE_TOO_LARGE: [413, 'Use an image no larger than 5 MiB and 10 megapixels.'],
};
const fail = (code) => {
  const [status, message] = messages[code];
  return Object.assign(new Error(message), { status, code });
};
module.exports = { messages, fail };
