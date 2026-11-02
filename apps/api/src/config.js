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
  const channelSecret = env.LINE_CHANNEL_SECRET?.trim();
  const accessToken = env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (Boolean(channelSecret) !== Boolean(accessToken)) throw new Error('Set both LINE_CHANNEL_SECRET and LINE_CHANNEL_ACCESS_TOKEN.');
  const geminiKey=env.GEMINI_API_KEY?.trim(),geminiModel=env.GEMINI_MODEL?.trim();
  if(Boolean(geminiKey)!==Boolean(geminiModel))throw new Error('Set both GEMINI_API_KEY and GEMINI_MODEL, or leave both empty.');
  if(geminiModel&&!/^[A-Za-z0-9._-]+$/.test(geminiModel))throw new Error('Invalid GEMINI_MODEL.');
  return { databaseUrl: env.DATABASE_URL, channelId: env.LINE_LOGIN_CHANNEL_ID,
    liffId: env.LIFF_ID, policyVersion: env.STORAGE_POLICY_VERSION, port,
    messaging: channelSecret ? { channelSecret, accessToken } : null,
    gemini:geminiKey?{apiKey:geminiKey,model:geminiModel}:null,
    tesseract:env.TESSERACT_COMMAND?.trim()||'tesseract' };
};
module.exports = { readConfig };
