const express = require('express');
const { errorHandler } = require('./http/middleware/error-handler');
const path = require('node:path');
const { authenticate } = require('./adapters/line-identity');
const { createPrivacyRouter } = require('./http/routes/privacy-routes');
const { fail } = require('./lib/errors');
const { createAcademicService } = require('./services/academic-service');
const { createAcademicRouter } = require('./http/routes/academic-routes');

const createApp = ({ verifyIdentity, consentService, academicService, pool, publicConfig, webRoot } = {}) => {
    const app = express();

    app.disable('x-powered-by');
    app.use((_req, res, next) => {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Referrer-Policy', 'no-referrer');
        res.set('Cache-Control', 'no-store');
        next();
    });

    app.use(express.json({ limit: '100kb', strict: false }));

    app.get('/health', (_req, res) => {
    res.status(200).json({
        data: {
            status: 'ok',
            service: 'rord-mai-api',
            },
        });
    });

    app.get('/ready', async (_req, res) => {
        if (!pool) throw fail('DATABASE_UNAVAILABLE');
        try { await pool.query('SELECT 1'); } catch { throw fail('DATABASE_UNAVAILABLE'); }
        res.json({ data: { status: 'ready' } });
    });
    app.get('/api/config', (_req, res) => res.json({ data: publicConfig || {} }));
    // Missing configuration always fails closed, including when constructed outside server.js.
    app.use('/api/v1', authenticate(verifyIdentity || (async () => { throw fail('IDENTITY_UNAVAILABLE'); })));
    if (consentService) {
        app.use('/api/v1', (req, _res, next) => {
            if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.is('application/json')) {
                return next(fail('UNSUPPORTED_MEDIA_TYPE'));
            }
            next();
        });
        app.use('/api/v1', createPrivacyRouter(consentService));
        app.use('/api/v1', createAcademicRouter(academicService || createAcademicService({ consentService })));
    }
    if (webRoot) {
        app.use(express.static(webRoot));
        app.get('/', (_req, res) => res.sendFile(path.join(webRoot, 'index.html')));
    }

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
