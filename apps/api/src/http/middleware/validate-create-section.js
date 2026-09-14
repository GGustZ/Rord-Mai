const { validateCreateSection } = require('../../lib/validate-create-section');

const validateCreateSectionBody = (req, res, next) => {
  if (!req.is('application/json')) return res.status(415).json({ error: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Use Content-Type: application/json.' } });
  const result = validateCreateSection(req.body);
  if (!result.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'The request contains invalid fields.', details: result.errors } });
  req.validated = result.data;
  return next();
};

module.exports = { validateCreateSectionBody };
