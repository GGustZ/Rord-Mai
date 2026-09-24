'use strict';
const messages = {
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

