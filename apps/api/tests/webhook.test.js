const request = require('supertest');
const { createHmac } = require('node:crypto');
const { createApp } = require('../src/app');
const { verifySignature, createLineMessaging } = require('../src/adapters/line-messaging');
const secret = 'test-only-secret';
const sign = raw => createHmac('sha256', secret).update(raw).digest('base64');
const chatService = { accept: jest.fn(), wake: jest.fn() };
const app = createApp({ lineWebhook: { secret, chatService } });
const send = (raw, signature = sign(raw)) => request(app).post('/webhooks/line').set('Content-Type', 'application/json').set('x-line-signature', signature).send(raw);
beforeEach(() => jest.resetAllMocks());

test('HOOK-001/007: verifies original raw bytes and durably accepts every batch member', async () => {
  const events = [{ type: 'message' }, { type: 'follow' }];
  const raw = ' { "events" : ' + JSON.stringify(events) + ' }\n';
  expect((await send(raw)).status).toBe(200);
  expect(chatService.accept.mock.calls).toEqual(events.map(e => [e]));
  expect(chatService.wake).toHaveBeenCalledTimes(1);
});
test.each(['', 'invalid', 'A'.repeat(43) + '='])('HOOK-002/003: invalid signature rejects before processing (%s)', async signature => {
  expect((await send('{"events":[]}', signature)).status).toBe(401);
  expect(chatService.accept).not.toHaveBeenCalled();
});
test('HOOK-004: changed byte invalidates signature', async () => {
  expect((await send('{ "events":[]}', sign('{"events":[]}'))).status).toBe(401);
  expect(verifySignature(Buffer.from('x'), undefined, secret)).toBe(false);
});
test('signed empty verification request is accepted; malformed signed data is rejected', async () => {
  expect((await send('{"events":[]}')).status).toBe(200);
  for (const raw of ['{', 'null', '{}', '{"events":{}}']) expect((await send(raw)).status).toBe(400);
});
test('QUEUE-006: storage failure returns retryable failure without processing', async () => {
  chatService.accept.mockRejectedValue(Error('private provider detail'));
  const response = await send('{"events":[{}]}');
  expect(response.status).toBe(503);
  expect(response.text).not.toContain('private');
  expect(chatService.wake).not.toHaveBeenCalled();
});
test('reply adapter uses only reply API and never exposes provider details on failure', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false });
  await expect(createLineMessaging({ accessToken: 'test-token', fetchImpl }).reply('reply-token', 'Saved')).rejects.toThrow('LINE reply failed');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.line.me/v2/bot/message/reply');
  expect(JSON.parse(options.body)).toEqual({ replyToken: 'reply-token', messages: [{ type: 'text', text: 'Saved' }] });
});
