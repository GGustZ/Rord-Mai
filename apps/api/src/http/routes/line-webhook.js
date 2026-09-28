'use strict';
const express = require('express');
const { verifySignature } = require('../../adapters/line-messaging');

const createLineWebhook = ({ secret, chatService }) => {
  const router = express.Router();
  router.post('/', express.raw({ type: 'application/json', limit: '1mb', inflate: false }), async (req, res) => {
    if (!verifySignature(req.body, req.get('x-line-signature'), secret)) {
      return res.status(401).json({ error: { code: 'INVALID_SIGNATURE' } });
    }
    let body;
    try { body = JSON.parse(req.body.toString('utf8')); }
    catch { return res.status(400).json({ error: { code: 'INVALID_JSON' } }); }
    if (!body || !Array.isArray(body.events) || body.events.length > 100) {
      return res.status(400).json({ error: { code: 'INVALID_WEBHOOK' } });
    }
    try {
      // Acknowledgement follows durable acceptance, never a fire-and-forget write.
      for (const event of body.events) await chatService.accept(event);
    } catch {
      return res.status(503).json({ error: { code: 'WEBHOOK_UNAVAILABLE' } });
    }
    res.sendStatus(200);
    chatService.wake();
  });
  return router;
};

module.exports = { createLineWebhook };
