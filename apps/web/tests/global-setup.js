import { createServer } from 'vite';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
// Own the Vite instance directly so teardown does not depend on Windows taskkill.
export default async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/\/rordmai_test(?:\?|$)/.test(url)) throw Error('Browser tests require the disposable rordmai_test database.');
  const { Pool } = require('../../api/node_modules/pg');
  const { migrate } = require('../../api/src/db/migrate');
  const { createConsentService } = require('../../api/src/services/consent-service');
  const { createApp } = require('../../api/src/app');
  const pool = new Pool({ connectionString:url });
  let apiServer, server;
  try {
    await migrate(pool);
    await pool.query('TRUNCATE students,sections CASCADE');
    const app = createApp({ pool, consentService:createConsentService({pool,currentPolicyVersion:'v1'}),
      publicConfig:{liffId:'123-test',policyVersion:'v1'},
      verifyIdentity:async token=>{
        if(!/^browser-[a-z0-9-]+$/.test(token)) throw Object.assign(Error('Test identity rejected'),{status:401,code:'UNAUTHENTICATED'});
        return {lineUserId:token};
      } });
    await new Promise((resolve,reject)=>{apiServer=app.listen(4174,'127.0.0.1',resolve);apiServer.on('error',reject);});
    server = await createServer({ server: { host: '127.0.0.1', port: 4173, strictPort: true,
      proxy:{'/api':'http://127.0.0.1:4174'} } });
    await server.listen();
    return async () => { await server.close(); await new Promise(resolve=>apiServer.close(resolve)); await pool.end(); };
  } catch(error) {
    await server?.close();
    if(apiServer) await new Promise(resolve=>apiServer.close(resolve));
    await pool.end();throw error;
  }
};
