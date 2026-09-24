const request = require('supertest');
const { createApp } = require('../src/app');
const { fail } = require('../src/lib/errors');
let service, app;
beforeEach(() => {
  service = {
    getConsent: jest.fn().mockResolvedValue({ storage: false, crossBorderExplanation: false, policyVersion: 'v1', updatedAt: null }),
    grantStorageConsent: jest.fn(), deleteData: jest.fn(),
    withStorageConsent: jest.fn().mockRejectedValue(Object.assign(Error(), { code: 'STORAGE_CONSENT_REQUIRED', status: 403 })),
  };
  app = createApp({ consentService: service, verifyIdentity: async (token) => {
    if (token !== 'valid') throw fail('UNAUTHENTICATED');
    return { lineUserId: 'trusted' };
  } });
});
const auth = (req) => req.set('Authorization', 'Bearer valid');
test('missing adapter never exposes a protected section route', async () => {
  expect((await request(createApp()).post('/api/v1/sections').send({})).status).toBe(401);
  expect((await auth(request(createApp()).post('/api/v1/sections')).send({})).status).toBe(503);
});
test('consent read requires verified identity', async () => {
  expect((await request(app).get('/api/v1/consents')).status).toBe(401);
  expect(service.getConsent).not.toHaveBeenCalled();
  expect((await auth(request(app).get('/api/v1/consents'))).status).toBe(200);
  expect(service.getConsent).toHaveBeenCalledWith({ identity: { lineUserId: 'trusted' } });
});
test('grant passes only verified identity to service', async () => {
  const response = await auth(request(app).put('/api/v1/consents')).send({ storage: true, crossBorderExplanation: false, policyVersion: 'v1' });
  expect(response.status).toBe(200);
  expect(service.grantStorageConsent).toHaveBeenCalledWith({ identity: { lineUserId: 'trusted' }, accepted: true, policyVersion: 'v1' });
});
test.each([
  { storage: 'true', crossBorderExplanation: false, policyVersion: 'v1' },
  { storage: true, crossBorderExplanation: false, policyVersion: 'v1', studentId: 'victim' },
  [], null, {},
])('invalid grant cannot write: %j', async (body) => {
  const response = await auth(request(app).put('/api/v1/consents')).set('Content-Type', 'application/json').send(JSON.stringify(body));
  expect(response.status).toBe(400);
  expect(service.grantStorageConsent).not.toHaveBeenCalled();
});
test('external explanation feature remains disabled', async () => {
  expect((await auth(request(app).put('/api/v1/consents')).send({ storage: true, crossBorderExplanation: true, policyVersion: 'v1' })).status).toBe(409);
});
test('withdrawal requires confirmation and then invokes deletion', async () => {
  const body = { storage: false, crossBorderExplanation: false, policyVersion: 'v1' };
  expect((await auth(request(app).put('/api/v1/consents')).send(body)).status).toBe(400);
  expect(service.deleteData).not.toHaveBeenCalled();
  expect((await auth(request(app).put('/api/v1/consents')).send({ ...body, confirmDeletion: true })).status).toBe(200);
  expect(service.deleteData).toHaveBeenCalledTimes(1);
});
test('delete confirms explicitly and responds 204 with no body', async () => {
  expect((await auth(request(app).delete('/api/v1/me/data')).send({})).status).toBe(400);
  const response = await auth(request(app).delete('/api/v1/me/data')).send({ confirmDeletion: true });
  expect(response.status).toBe(204);
  expect(response.text).toBe('');
});
test('missing consent blocks own enrolment read', async () => {
  expect((await auth(request(app).get('/api/v1/enrollments'))).status).toBe(403);
});
test('unsupported media, oversized body and malformed JSON fail safely', async () => {
  expect((await auth(request(app).put('/api/v1/consents')).type('text').send('yes')).status).toBe(415);
  expect((await auth(request(app).put('/api/v1/consents')).send({ big: 'x'.repeat(110000) })).status).toBe(413);
  expect((await auth(request(app).put('/api/v1/consents')).type('json').send('{')).status).toBe(400);
});
test('database readiness reports failure without detail', async () => {
  const broken = createApp({ pool: { query: async () => { throw Error('postgres://secret'); } } });
  const response = await request(broken).get('/ready');
  expect(response.status).toBe(503);
  expect(response.text).not.toContain('secret');
});
