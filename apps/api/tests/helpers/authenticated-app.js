const supertest = require('supertest');
const { createApp: productionApp } = require('../../src/app');
// Test-only identity adapter. No production environment flag bypasses authentication.
const createApp = () => productionApp({ verifyIdentity: async () => ({ lineUserId: 'validation-test' }) });
const request = (app) => {
  const agent = supertest(app);
  for (const verb of ['get', 'post', 'put', 'patch', 'delete']) {
    const send = agent[verb].bind(agent);
    agent[verb] = (...args) => send(...args).set('Authorization', 'Bearer test-only');
  }
  return agent;
};
module.exports = { createApp, request };
