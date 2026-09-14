const validateJoinSection = (req, res, next) => {
    if (!req.is('application/json')) {
        return res.status(415).json({
            error: {
                code: 'UNSUPPORTED_MEDIA_TYPE',
                message: 'Use Content-Type: application/json.',
            },
        });
    }

    const body = req.body;
    const isObject =
        body !== null &&
        typeof body === 'object' &&
        !Array.isArray(body);

    if (!isObject) {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'The request body must be a JSON object.',
            },
        });
    }

    const unexpectedFields = Object.keys(body).filter(
        (key) => key !== 'joinCode'
    );

    if (unexpectedFields.length > 0) {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'The request body contains unsupported fields.',
            },
        });
    }

    if (typeof body.joinCode !== 'string') {
        return res.status(400).json({
            error: {
                code: 'VALIDATION_ERROR',
                message: 'joinCode is required and must be a string.',
            },
        });
    }

    const joinCode = body.joinCode.trim().toUpperCase();

    if (!/^[A-Z0-9]{6}$/.test(joinCode)) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'joinCode must contain exactly six letters or digits.',
            },
        });
    }

    req.validated = { joinCode };

    return next();
};

module.exports = {validateJoinSection};
