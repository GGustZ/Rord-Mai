const errorHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: {
                code: 'INVALID_JSON',
                message: 'The request body must contain valid JSON.',
            },
        });
    }

    if (error.type === 'entity.too.large') {
        return res.status(413).json({
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'The request body exceeds the allowed size.',
            },
        });
    }

    const consentErrors = {
        UNAUTHENTICATED: { status: 401, message: 'Verified LINE identity is required.' },
        EXPLICIT_CONSENT_REQUIRED: { status: 400, message: 'Explicit storage consent is required.' },
        POLICY_VERSION_OUTDATED: { status: 409, message: 'Accept the current storage policy.' },
        STORAGE_CONSENT_REQUIRED: { status: 403, message: 'Storage consent is required.' },
    };
    const knownError = Object.hasOwn(consentErrors, error.code) ? consentErrors[error.code] : undefined;
    if (knownError && error.status === knownError.status) {
        return res.status(knownError.status).json({
            error: { code: error.code, message: knownError.message },
        });
    }

    console.error(error);

    return res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred.'
        },
    });

};

module.exports = { errorHandler };
