const request = require('supertest');
const { createHmac } = require('node:crypto');
const { createApp } = require('../src/app');
const { verifySignature, createLineMessaging } = require('../src/adapters/line-messaging');
const {createChatService} = require('../src/services/chat-service');
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
test('LIN-03: a stalled consent reminder does not delay HTTP acknowledgement',async()=>{
  let release;
  const messaging={reply:jest.fn(()=>new Promise(resolve=>{release=resolve;}))};
  const pool={query:jest.fn().mockResolvedValue({rows:[]})};
  const chat=createChatService({pool,messaging,liffId:'123-test',consentService:{withStorageConsent:async()=>{throw Object.assign(Error(),{code:'STORAGE_CONSENT_REQUIRED'});}}});
  const isolated=createApp({lineWebhook:{secret,chatService:chat}});
  const raw=JSON.stringify({events:[{type:'message',source:{type:'user',userId:'U'+'a'.repeat(32)},
    message:{type:'text',text:'my private marks'},webhookEventId:'test-event',replyToken:'test-reply',timestamp:Date.now()}]});
  const started=performance.now();
  try {
    const response=await request(isolated).post('/webhooks/line').type('json').set('x-line-signature',sign(raw)).send(raw);
    expect(response.status).toBe(200);expect(performance.now()-started).toBeLessThan(1000);
    expect(messaging.reply).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls.every(([sql])=>!sql.includes('INSERT'))).toBe(true);
  } finally { release?.();await chat.stop(); }
});
test('LIN-03: acknowledgement still waits for durable acceptance',async()=>{
  let release,entered;
  const accepted=new Promise(resolve=>{entered=resolve;});
  chatService.accept.mockImplementation(()=>{entered();return new Promise(resolve=>{release=resolve;});});
  let responded=false;
  const pending=send('{"events":[{}]}').then(response=>{responded=true;return response;});
  await accepted;
  expect(responded).toBe(false);expect(chatService.wake).not.toHaveBeenCalled();
  release();expect((await pending).status).toBe(200);
});
test('reply adapter uses only reply API and never exposes provider details on failure', async () => {
  const fetchImpl = jest.fn().mockResolvedValue({ ok: false });
  await expect(createLineMessaging({ accessToken: 'test-token', fetchImpl }).reply('reply-token', 'Saved')).rejects.toThrow('LINE reply failed');
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, options] = fetchImpl.mock.calls[0];
  expect(url).toBe('https://api.line.me/v2/bot/message/reply');
  const body=JSON.parse(options.body);
  expect(body.replyToken).toBe('reply-token');expect(body.messages[0].text).toBe('Saved');
  expect(body.messages[0].quickReply.items.map(item=>item.action.text)).toEqual(['score','summary','cancel']);
});
test('native quick replies route numbered selections and confirmation through the existing message flow',()=>{
  const {quickReplies}=require('../src/adapters/line-messaging');
  expect(quickReplies('Choose a course:\n1. TEST Fictional course\n2. MATH Fictional math\nSend next for more.').items.map(item=>item.action.text)).toEqual(['1','2','score','summary','cancel','next']);
  expect(quickReplies('Send confirm to save, edit to change, or cancel.').items.map(item=>item.action.text)).toContain('confirm');
});
test('LINE attachment retrieval validates IDs and limits streamed content',async()=>{
  const fetchImpl=jest.fn(async()=>new Response(Uint8Array.from([1,2,3,4])));
  const client=createLineMessaging({accessToken:'test',fetchImpl});
  await expect(client.getContent('12345',4)).resolves.toEqual(Buffer.from([1,2,3,4]));
  expect(fetchImpl.mock.calls[0][0]).toBe('https://api-data.line.me/v2/bot/message/12345/content');
  await expect(client.getContent('12345',3)).rejects.toMatchObject({code:'IMAGE_TOO_LARGE'});
  await expect(client.getContent('../bad',4)).rejects.toThrow();
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
