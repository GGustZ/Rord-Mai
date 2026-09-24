'use strict';
const readConfig = (env = process.env) => {
  for (const key of ['DATABASE_URL', 'LINE_LOGIN_CHANNEL_ID', 'LIFF_ID', 'STORAGE_POLICY_VERSION']) {
    if (!env[key]?.trim()) throw new Error(`Missing required configuration: ${key}`);
  }
  let databaseUrl;
  try { databaseUrl = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL.'); }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) throw new Error('DATABASE_URL must use PostgreSQL.');
  if (!/^\d+$/.test(env.LINE_LOGIN_CHANNEL_ID)) throw new Error('Invalid LINE_LOGIN_CHANNEL_ID.');
  if (!/^\d+-[A-Za-z0-9]+$/.test(env.LIFF_ID)) throw new Error('Invalid LIFF_ID.');
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
  return { databaseUrl: env.DATABASE_URL, channelId: env.LINE_LOGIN_CHANNEL_ID,
    liffId: env.LIFF_ID, policyVersion: env.STORAGE_POLICY_VERSION, port };
};
module.exports = { readConfig };
