const express = require('express');
const { errorHandler } = require('./http/middleware/error-handler');
const { sectionRouter } = require('./http/routes/section-routes');

const createApp = () => {
    const app = express();

    app.disable('x-powered-by');

    app.use(express.json({ limit: '100kb', strict: false }));

    app.get('/health', (_req, res) => {
    res.status(200).json({
        data: {
            status: 'ok',
            service: 'rord-mai-api',
            },
        });
    });

    app.use('/api/v1/sections', sectionRouter);

    app.use((_req, res) => {
        res.status(404).json({
            error: {
                code: 'ROUTE_NOT_FOUND',
                message: 'The request endpoint does not exist.',
            },
        });
    });

    app.use(errorHandler);

    return app;
}

module.exports = { createApp };
