'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

const verifySignature = (body, signature, secret) => {
  if (!Buffer.isBuffer(body) || typeof signature !== 'string' || !secret ||
      !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const supplied = Buffer.from(signature, 'base64');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
};

const createLineMessaging = ({ accessToken, fetchImpl = fetch }) => ({
  reply: async (replyToken, text) => {
    const response = await fetchImpl('https://api.line.me/v2/bot/message/reply', {
      method: 'POST', signal: AbortSignal.timeout(5000),
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4500) }] }),
    });
    // Never include provider bodies, tokens or private messages in application logs/errors.
    if (!response.ok) throw new Error('LINE reply failed. Check LIFF before restarting chat.');
  },
});

module.exports = { verifySignature, createLineMessaging };
