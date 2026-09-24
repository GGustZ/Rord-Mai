'use strict';
const { fail } = require('../lib/errors');
const createLineVerifier = ({ channelId, fetchImpl = fetch, now = Date.now }) => {
  if (!/^\d+$/.test(channelId || '')) throw new Error('LINE_LOGIN_CHANNEL_ID must contain digits.');
  return async (token) => {
    if (typeof token !== 'string' || token.length > 8192 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) {
      throw fail('UNAUTHENTICATED');
    }
    let response, claims;
    try {
      response = await fetchImpl('https://api.line.me/oauth2/v2.1/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: token, client_id: channelId }),
        signal: AbortSignal.timeout(5000), redirect: 'error',
      });
      if (response.status === 400 || response.status === 401) throw fail('UNAUTHENTICATED');
      if (!response.ok) throw fail('IDENTITY_UNAVAILABLE');
      claims = await response.json();
    } catch (error) {
      if (error.code === 'UNAUTHENTICATED') throw error;
      throw fail('IDENTITY_UNAVAILABLE');
    }
    if (!claims || claims.iss !== 'https://access.line.me' || claims.aud !== channelId ||
        !Number.isInteger(claims.exp) || claims.exp <= Math.floor(now() / 1000) ||
        !Number.isInteger(claims.iat) || claims.iat > Math.floor(now() / 1000) + 60 ||
        typeof claims.sub !== 'string' || !/^U[0-9a-f]{32}$/i.test(claims.sub)) {
      throw fail('UNAUTHENTICATED');
    }
    // Identity comes only from LINE's verified response, never decoded client claims.
    return Object.freeze({ lineUserId: claims.sub });
  };
};
const authenticate = (verifyIdentity) => async (req, _res, next) => {
  try {
    const match = /^Bearer ([^\s]+)$/i.exec(req.get('authorization') || '');
    if (!match) throw fail('UNAUTHENTICATED');
    req.identity = await verifyIdentity(match[1]);
    next();
  } catch (error) { next(error); }
};
module.exports = { createLineVerifier, authenticate };

