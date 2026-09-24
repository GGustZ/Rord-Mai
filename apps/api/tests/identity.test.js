const { createLineVerifier } = require('../src/adapters/line-identity');
const claims = { iss: 'https://access.line.me', aud: '123', sub: 'U' + 'a'.repeat(32), exp: 2000, iat: 900 };
const setup = (body = claims, status = 200) => {
  const fetchImpl = jest.fn().mockResolvedValue({ status, ok: status === 200, json: async () => body });
  return { fetchImpl, verify: createLineVerifier({ channelId: '123', fetchImpl, now: () => 1000000 }) };
};
test('verified response establishes identity and expected channel is sent to LINE', async () => {
  const { verify, fetchImpl } = setup();
  expect(await verify('a.b.c')).toEqual({ lineUserId: claims.sub });
  expect(fetchImpl.mock.calls[0][1].body.get('client_id')).toBe('123');
  expect(fetchImpl.mock.calls[0][1].body.get('id_token')).toBe('a.b.c');
});
test.each(['', 'forged', 'a.b', 'a.b.c d'])('malformed token fails before external call: %s', async (token) => {
  const { verify, fetchImpl } = setup();
  await expect(verify(token)).rejects.toMatchObject({ status: 401 });
  expect(fetchImpl).not.toHaveBeenCalled();
});
test.each([
  { ...claims, exp: 999 }, { ...claims, aud: 'another-channel' },
  { ...claims, iss: 'https://attacker.test' }, { ...claims, sub: '' },
  { ...claims, iat: 2000 }, null,
])('invalid provider claims fail closed: %j', async (body) => {
  await expect(setup(body).verify('a.b.c')).rejects.toMatchObject({ status: 401 });
});
test.each([400, 401])('LINE rejects forged or expired token with %i', async (status) => {
  await expect(setup({}, status).verify('a.b.c')).rejects.toMatchObject({ status: 401 });
});
test.each([429, 500])('provider failure returns unavailable: %i', async (status) => {
  await expect(setup({}, status).verify('a.b.c')).rejects.toMatchObject({ status: 503 });
});
test('network failure fails closed without exposing provider error', async () => {
  const verify = createLineVerifier({ channelId: '123', fetchImpl: async () => { throw Error('secret-token'); } });
  await expect(verify('a.b.c')).rejects.toMatchObject({ code: 'IDENTITY_UNAVAILABLE' });
});

