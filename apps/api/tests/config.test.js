const { readConfig } = require('../src/config');
const env = { DATABASE_URL: 'postgresql://localhost/test', LINE_LOGIN_CHANNEL_ID: '123', LIFF_ID: '123-abc', STORAGE_POLICY_VERSION: 'v1' };
test.each(Object.keys(env))('startup refuses missing %s', (key) => {
  expect(() => readConfig({ ...env, [key]: '' })).toThrow(key);
});
test('only validated public and server settings are returned', () => {
  expect(readConfig(env).port).toBe(3000);
  expect(() => readConfig({ ...env, PORT: '0' })).toThrow();
  expect(() => readConfig({ ...env, DATABASE_URL: 'https://example.com' })).toThrow();
});

