'use strict';
const path = require('node:path');
const { createApp } = require('./app');
const { readConfig } = require('./config');
const { createPool } = require('./db/pool');
const { migrate } = require('./db/migrate');
const { createLineVerifier } = require('./adapters/line-identity');
const { createConsentService } = require('./services/consent-service');
const { createLineMessaging } = require('./adapters/line-messaging');
const { createChatService } = require('./services/chat-service');
const start = async () => {
  let config;
  try { config = readConfig(); }
  catch (error) { console.error(error.message); throw error; }
  const pool = createPool(config.databaseUrl);
  let chatService;
  try {
    await migrate(pool);
    const consentService = createConsentService({ pool, currentPolicyVersion: config.policyVersion });
    if (config.messaging) chatService = createChatService({ pool, consentService, liffId: config.liffId,
      messaging: createLineMessaging({ accessToken: config.messaging.accessToken }) });
    else console.warn('LINE chat is disabled: configure both Messaging API credentials before the presentation.');
    const app = createApp({
      pool, verifyIdentity: createLineVerifier({ channelId: config.channelId }),
      consentService,
      lineWebhook: chatService ? { secret: config.messaging.channelSecret, chatService } : null,
      publicConfig: { liffId: config.liffId, policyVersion: config.policyVersion },
      webRoot: path.resolve(__dirname, '../../web/dist'),
    });
    const server = app.listen(config.port, () => console.log('Rord-Mai listening on port ' + config.port));
    chatService?.start();
    server.on('error', async () => { console.error('HTTP server failed.'); await chatService?.stop(); await pool.end(); process.exitCode = 1; });
    let closing = false;
    const shutdown = () => {
      if (closing) return;
      closing = true;
      server.close(async () => { await chatService?.stop(); await pool.end(); });
      setTimeout(() => process.exit(1), 10000).unref();
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
    return server;
  } catch (error) {
    await chatService?.stop();
    await pool.end();
    throw error;
  }
};
if (require.main === module) start().catch(() => {
  console.error('Startup failed. Check required configuration and database migrations. No HTTP listener was started.');
  process.exitCode = 1;
});
module.exports = { start };
