'use strict';
const http=require('node:http');
const request=require('supertest');
const {createApp}=require('../src/app');

const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const identity={lineUserId:'test-user'};
const ctx={studentId:'test-student'};
const draft={components:[],warnings:[],requiresConfirmation:true};
const consentService={withStorageConsent:async(_input,work)=>work(ctx)};
const makeApp=service=>createApp({verifyIdentity:async()=>identity,consentService:service,ocrService:{extract:async()=>draft}});
const post=app=>request(app).post('/api/v1/ocr/syllabus').set('Authorization','Bearer test')
  .attach('image',Buffer.from('file bytes'),'syllabus.png');

test('disconnect during consent lookup does not occupy the shared OCR upload slot',async()=>{
  const entered=deferred(),release=deferred(),closed=deferred();let first=true;
  const service={withStorageConsent:async(input,work)=>{
    if(first){first=false;entered.resolve();await release.promise;}
    return consentService.withStorageConsent(input,work);
  }};
  const app=makeApp(service),server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  server.prependListener('request',req=>req.once('aborted',closed.resolve));
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/v1/ocr/syllabus',method:'POST',
    headers:{Authorization:'Bearer test','Content-Type':'multipart/form-data; boundary=test'}});
  req.on('error',()=>{});req.write('--test\r\n');
  try{
    await entered.promise;req.destroy();await closed.promise;release.resolve();await tick();
    expect((await post(app)).status).toBe(200);
  }finally{
    release.resolve();req.destroy();server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
  }
});

test('aborted multipart upload releases the slot for the next user',async()=>{
  const app=makeApp(consentService),server=app.listen(0,'127.0.0.1'),entered=deferred(),closed=deferred();
  await new Promise(resolve=>server.once('listening',resolve));
  server.prependListener('request',req=>{entered.resolve();req.once('aborted',closed.resolve);});
  const req=http.request({host:'127.0.0.1',port:server.address().port,path:'/api/v1/ocr/syllabus',method:'POST',
    headers:{Authorization:'Bearer test','Content-Type':'multipart/form-data; boundary=test'}});
  req.on('error',()=>{});req.write('--test\r\n');
  try{
    await entered.promise;await tick();req.destroy();await closed.promise;await tick();
    expect((await post(app)).status).toBe(200);
  }finally{
    req.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  }
});
