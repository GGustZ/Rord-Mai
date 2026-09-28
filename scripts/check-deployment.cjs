'use strict';
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const main = async () => {
  const url = new URL(process.argv[2] || 'http://127.0.0.1:3000');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname))) throw Error('Use HTTPS for public deployment.');
  if (url.username || url.password || url.search || url.hash) throw Error('Use a base URL without credentials or query strings.');
  const get = async (route, options) => fetch(new URL(route, url), { ...options, signal: AbortSignal.timeout(90000), redirect: 'error' });
  for (const route of ['/health', '/ready']) {
    const response = await get(route); assert.equal(response.status, 200, route); console.log('PASS ' + route);
  }
  const config = await (await get('/api/config')).json();
  assert.deepEqual(Object.keys(config.data).sort(), ['liffId', 'policyVersion']);
  assert.match(config.data.liffId, /^\d+-[A-Za-z0-9]+$/);
  assert.equal((await get('/')).status, 200);
  assert.equal((await get('/api/v1/consents')).status, 401);
  assert.equal((await get('/webhooks/line', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"events":[]}' })).status, 401);
  if (process.env.LINE_CHANNEL_SECRET) {
    const body = '{"events":[]}';
    const signature = createHmac('sha256', process.env.LINE_CHANNEL_SECRET).update(body).digest('base64');
    assert.equal((await get('/webhooks/line', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-line-signature': signature }, body })).status, 200);
  }
  console.log('PASS web, public configuration, denied anonymous access and webhook authentication. Real phone login still requires a separate check.');
};
main().catch(() => { console.error('Release smoke check failed. Check service readiness, chat configuration and deployment logs.'); process.exitCode = 1; });
