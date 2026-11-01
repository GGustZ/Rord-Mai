const errorHandler = (error, _req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: {
                code: 'INVALID_JSON',
                message: 'ข้อมูลที่ส่งต้องเป็น JSON ที่ถูกต้อง',
            },
        });
    }

    if (error.type === 'entity.too.large') {
        return res.status(413).json({
            error: {
                code: 'PAYLOAD_TOO_LARGE',
                message: 'ข้อมูลที่ส่งมีขนาดเกินกำหนด',
            },
        });
    }

    const consentErrors = {
        UNAUTHENTICATED: { status: 401, message: 'กรุณาเข้าสู่ระบบด้วย LINE ที่ตรวจสอบแล้ว' },
        EXPLICIT_CONSENT_REQUIRED: { status: 400, message: 'กรุณายินยอมให้จัดเก็บข้อมูลอย่างชัดเจน' },
        POLICY_VERSION_OUTDATED: { status: 409, message: 'กรุณายอมรับนโยบายการจัดเก็บข้อมูลฉบับปัจจุบัน' },
        STORAGE_CONSENT_REQUIRED: { status: 403, message: 'กรุณายินยอมให้จัดเก็บข้อมูลก่อนใช้งาน' },
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
            message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่'
        },
    });

};

module.exports = { errorHandler };
