const express = require('express');
const {
    validateJoinSection,
} = require('../middleware/validate-join-section');

const sectionRouter = express.Router();
const { validateCreateSectionBody } = require('../middleware/validate-create-section');

sectionRouter.post('/', validateCreateSectionBody, (_req, res) => {
    return res.status(501).json({ error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Section creation is not available yet.',
    } });
});

sectionRouter.post('/join', validateJoinSection, (_req, res) => {
    return res.status(501).json({
        error: {
            code: 'NOT_IMPLEMENTED',
            message: 'Section enrollment is not available yet.',
        },
    });
});

module.exports = { sectionRouter }
