'use strict';
const messages = {
  JOIN_CODE_UNAVAILABLE: [503, 'Could not allocate a join code. Please retry.'],
  SECTION_NOT_FOUND: [404, 'No section matches this join code.'],
  ALREADY_ENROLLED: [409, 'You already joined this section.'],
  CREATOR_REQUIRED: [403, 'Only the section creator may correct weights.'],
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
};
const fail = (code) => {
  const [status, message] = messages[code];
  return Object.assign(new Error(message), { status, code });
};
module.exports = { messages, fail };
