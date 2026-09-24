'use strict';
const express = require('express');
const { fail } = require('../../lib/errors');
const { listOwnedEnrollments, parseCursor } = require('../../repositories/academic-repository');
const objectWithKeys = (body, allowed) => body !== null && typeof body === 'object' &&
  !Array.isArray(body) && Object.keys(body).every((key) => allowed.includes(key));
const createPrivacyRouter = (service) => {
  const router = express.Router();
  router.get('/consents', async (req, res) => res.json({ data: await service.getConsent({ identity: req.identity }) }));
  router.put('/consents', async (req, res) => {
    const body = req.body;
    if (!objectWithKeys(body, ['storage', 'crossBorderExplanation', 'policyVersion', 'confirmDeletion']) ||
        typeof body.storage !== 'boolean' || typeof body.crossBorderExplanation !== 'boolean' ||
        typeof body.policyVersion !== 'string' ||
        (body.confirmDeletion !== undefined && typeof body.confirmDeletion !== 'boolean')) throw fail('VALIDATION_ERROR');
    if (body.crossBorderExplanation) throw fail('FEATURE_UNAVAILABLE');
    if (body.storage) {
      await service.grantStorageConsent({ identity: req.identity, accepted: true, policyVersion: body.policyVersion });
    } else {
      // Explicit confirmation is required even for repeated withdrawal. Initial decline stays in the UI.
      if (body.confirmDeletion !== true) throw fail('CONFIRMATION_REQUIRED');
      await service.deleteData({ identity: req.identity });
    }
    res.json({ data: await service.getConsent({ identity: req.identity }) });
  });
  router.delete('/me/data', async (req, res) => {
    if (!objectWithKeys(req.body, ['confirmDeletion']) || req.body.confirmDeletion !== true) throw fail('CONFIRMATION_REQUIRED');
    await service.deleteData({ identity: req.identity });
    res.status(204).end();
  });
  router.get('/enrollments', async (req, res) => {
    if (Object.keys(req.query).some((key) => !['limit', 'cursor'].includes(key))) throw fail('VALIDATION_ERROR');
    const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
        (req.query.limit !== undefined && !/^[1-9]\d*$/.test(req.query.limit))) throw fail('VALIDATION_ERROR');
    parseCursor(req.query.cursor);
    const page = await service.withStorageConsent({ identity: req.identity }, ({ client, studentId }) =>
      listOwnedEnrollments(client, studentId, { limit, cursor: req.query.cursor || null }));
    res.json({ data: page });
  });
  return router;
};
module.exports = { createPrivacyRouter };
