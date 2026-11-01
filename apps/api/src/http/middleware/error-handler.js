const errorHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: {
                code: 'INVALID_JSON',
                message: 'The request body must be valid JSON.',
            },
        });
    }

    if (error.type === 'entity.too.large') {
        return res.status(413).json({
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'The request body is too large.',
            },
        });
    }

    const consentErrors = {
        UNAUTHENTICATED: { status: 401, message: 'Sign in with a verified LINE identity.' },
        EXPLICIT_CONSENT_REQUIRED: { status: 400, message: 'Explicit storage permission is required.' },
        POLICY_VERSION_OUTDATED: { status: 409, message: 'Accept the current storage policy.' },
        STORAGE_CONSENT_REQUIRED: { status: 403, message: 'Allow academic storage before using this feature.' },
    };
    const { messages } = require('../../lib/errors');
    for (const [code, [status, message]] of Object.entries(messages)) consentErrors[code] = { status, message };
    const knownError = Object.hasOwn(consentErrors, error.code) ? consentErrors[error.code] : undefined;
    if (knownError && error.status === knownError.status) {
        return res.status(knownError.status).json({
            error: { code: error.code, message: knownError.message,
                ...(error.code === 'VALIDATION_ERROR' && Array.isArray(error.details) ? { details: error.details } : {}) },
        });
    }

    // Never emit PostgreSQL detail, request bodies or provider errors containing personal data.
    console.error('Unhandled request error.');

    return res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred. Please try again.'
        },
    });

};

module.exports = { errorHandler };
