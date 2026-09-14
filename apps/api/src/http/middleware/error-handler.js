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

    console.error(error);

    return res.status(500).json({
        error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: 'An unexpected error occurred.'
        },
    });

};

module.exports = { errorHandler };
