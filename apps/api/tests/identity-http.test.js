const request = require('supertest');
const {createApp} = require('../src/app');
const {createLineVerifier} = require('../src/adapters/line-identity');
const claims={iss:'https://access.line.me',aud:'123',exp:2000,iat:900,sub:'U'+'a'.repeat(32)};
const token=[{alg:'RS256',typ:'JWT'},claims].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')+'.forged-signature';
test.each([
  ['expired claim',{ok:true,status:200,json:async()=>({...claims,exp:999})}],
  ['forged token rejected by provider',{ok:false,status:400}],
  ['wrong audience',{ok:true,status:200,json:async()=>({...claims,aud:'456'})}],
])('QA-03: production verifier rejects %s before HTTP handler',async(_name,response)=>{
  const fetchImpl=jest.fn().mockResolvedValue(response);
  const getConsent=jest.fn();
  const app=createApp({consentService:{getConsent},verifyIdentity:createLineVerifier({channelId:'123',fetchImpl,now:()=>1000000})});
  const result=await request(app).get('/api/v1/consents').set('Authorization','Bearer '+token);
  expect(result.status).toBe(401);expect(getConsent).not.toHaveBeenCalled();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});
test('production verifier permits verified claims and supplies only provider identity',async()=>{
  const getConsent=jest.fn().mockResolvedValue({storage:false});
  const app=createApp({consentService:{getConsent},verifyIdentity:createLineVerifier({channelId:'123',now:()=>1000000,
    fetchImpl:async()=>({ok:true,status:200,json:async()=>claims})})});
  expect((await request(app).get('/api/v1/consents').set('Authorization','Bearer '+token)).status).toBe(200);
  expect(getConsent).toHaveBeenCalledWith({identity:{lineUserId:claims.sub}});
});
