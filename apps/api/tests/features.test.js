const fs=require('node:fs/promises');
const sharp=require('sharp');
const {gpax}=require('../../../packages/engine/src/gpax');
const {createOcrService,parseSyllabus}=require('../src/services/ocr-service');
const {payloadFor,templateFor,renderGenerated}=require('../src/services/explanation-service');
const {createGemini}=require('../src/adapters/gemini');
const {createLineMessaging}=require('../src/adapters/line-messaging');
const {deadlineCutoff}=require('../src/services/notification-service');
const {readConfig}=require('../src/config');
const png=()=>sharp({create:{width:10,height:10,channels:3,background:'white'}}).png().toBuffer();
test('GPAX aggregates a hand-calculated three-course case without intermediate rounding',()=>{
  const result=gpax({currentGpa:3,creditsCounted:30,courses:[{credits:3,outcome:'grade',grade:'B'},{credits:3,outcome:'grade',grade:'B+'},{credits:3,outcome:'grade',grade:'A'}]});
  expect(result.qualityPoints).toBe(121.5);expect(result.creditsCounted).toBe(39);expect(result.gpax).toBe(121.5/39);
  expect(gpax({currentGpa:0,creditsCounted:0,courses:[]}).gpax).toBeNull();
  expect(gpax({currentGpa:3,creditsCounted:30,courses:[{credits:3,outcome:'withdraw'}]}).gpax).toBe(3);
  expect(()=>gpax({currentGpa:3,creditsCounted:30,courses:[{credits:3,outcome:'grade',grade:'A',repeat:true}]})).toThrow('unverified');
});
test.each([NaN,Infinity,-1,5,'3'])('GPAX rejects invalid cumulative GPA %s',currentGpa=>{
  expect(()=>gpax({currentGpa,creditsCounted:30,courses:[]})).toThrow();
});
test('only explicit numeric metrics enter explanations; hallucinated/missing numbers fail verification',()=>{
  const payload=payloadFor('summary',{currentWeightedScore:32,gradedWeightPercent:40,remainingWeightPercent:60,maximumPossibleScore:92,name:'secret',lineUserId:'secret'});
  expect(JSON.stringify(payload)).not.toContain('secret');expect(templateFor(payload)).toContain('32');
  expect(renderGenerated('คะแนน {{current}} ประเมิน {{graded}} เหลือ {{remaining}} สูงสุด {{maximum}}',payload)).toContain('32');
  for(const text of ['คะแนน 99','คะแนน ๙๙','{{current}}','{{current}} {{graded}} {{remaining}} {{unknown}}','{{current}} {{graded}} {{remaining}} {{maximum}} 1'])expect(()=>renderGenerated(text,payload)).toThrow();
});
test('Gemini uses server headers, JSON output and a bounded signal, with no implicit model',async()=>{
  expect(createGemini({})).toBeNull();
  const fetchImpl=jest.fn().mockResolvedValue({ok:true,json:async()=>({candidates:[{content:{parts:[{text:'{"text":"คะแนน {{current}}"}'}]}}]})});
  const generate=createGemini({apiKey:'private',model:'configured-model',fetchImpl});
  expect(await generate({kind:'summary',metrics:{current:32}})).toBe('คะแนน {{current}}');
  const [url,options]=fetchImpl.mock.calls[0];expect(url).not.toContain('private');expect(options.headers['x-goog-api-key']).toBe('private');expect(options.signal).toBeDefined();
  expect(JSON.parse(options.body).generationConfig.responseMimeType).toBe('application/json');
  const base={DATABASE_URL:'postgres://localhost/test',LINE_LOGIN_CHANNEL_ID:'123',LIFF_ID:'123-abc',STORAGE_POLICY_VERSION:'v1'};
  expect(()=>readConfig({...base,GEMINI_API_KEY:'private'})).toThrow('both');
});
test('push retries carry the same key and accept only a verified duplicate response',async()=>{
  const fetchImpl=jest.fn().mockResolvedValue({ok:false,status:409,headers:new Headers({'x-line-accepted-request-id':'accepted'})});
  const client=createLineMessaging({accessToken:'private',fetchImpl});await client.push('user','text','key');
  expect(fetchImpl.mock.calls[0][1].headers['X-Line-Retry-Key']).toBe('key');
  fetchImpl.mockResolvedValue({ok:false,status:409,headers:new Headers()});await expect(client.push('user','text','key')).rejects.toMatchObject({retryable:false});
  fetchImpl.mockRejectedValue(Error('network'));await expect(client.push('user','text','key')).rejects.toMatchObject({retryable:true});
  expect(deadlineCutoff('2026-10-07').toISOString()).toBe('2026-10-07T16:59:59.999Z');
});

test('LINE push supports Flex objects without changing text-message callers',async()=>{
  const fetchImpl=jest.fn().mockResolvedValue({ok:true});
  const client=createLineMessaging({accessToken:'test-only',fetchImpl});
  const card={type:'flex',altText:'Academic Risk Alert',contents:{type:'bubble',body:{type:'box',layout:'vertical',contents:[{type:'text',text:'Test'}]}}};
  await client.push('user',card,'same-retry-key');
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body).messages).toEqual([card]);
  await client.push('user','Legacy text','same-retry-key');
  expect(JSON.parse(fetchImpl.mock.calls[1][1].body).messages).toEqual([{type:'text',text:'Legacy text'}]);
});
test('syllabus parsing uses Thai/English percentages, warns on gaps and never produces a saved section',()=>{
  const result=parseSyllabus('Midterm 40%\nงาน ๖๐%\nTotal 100%');
  expect(result.components.map(c=>c.weightPercent)).toEqual([40,60]);expect(result.requiresConfirmation).toBe(true);
  expect(parseSyllabus('Midterm 95%').warnings.join(' ')).toContain('100%');
  expect(()=>parseSyllabus('unreadable image')).toThrow();
});
test('syllabus parsing stops at the assessment total before unrelated percentages',()=>{
  const result=parseSyllabus('Midterm 30%\nFinal 30%\nLabs 40%\nTOTAL 100%\nEach learning outcome requires 50%');
  expect(result.components.map(c=>[c.name,c.weightPercent])).toEqual([['Midterm',30],['Final',30],['Labs',40]]);
});
test('OCR validates content, dimensions, decoded images and processing cleanup',async()=>{
  let temporary;
  const recognizeImage=jest.fn(async file=>{temporary=file;expect((await fs.stat(file)).size).toBeGreaterThan(0);return 'Midterm 40%\nFinal 60%';});
  const service=createOcrService({recognizeImage});
  await expect(service.extract(Buffer.from('%PDF pretend.png'))).rejects.toMatchObject({code:'IMAGE_REQUIRED'});
  await expect(service.extract(Buffer.alloc(5*1024*1024+1))).rejects.toMatchObject({code:'IMAGE_TOO_LARGE'});
  await expect(service.extract(Buffer.from([137,80,78,71,13,10,26,10]))).rejects.toMatchObject({code:'IMAGE_REQUIRED'});
  const oversized=await sharp({create:{width:4000,height:3000,channels:3,background:'white'}}).png().toBuffer();
  await expect(service.extract(oversized)).rejects.toMatchObject({code:'IMAGE_TOO_LARGE'});
  expect((await service.extract(await png())).components).toHaveLength(2);
  await expect(fs.stat(temporary)).rejects.toMatchObject({code:'ENOENT'});
});
test('OCR refuses concurrent processing and recovers after a failed recognizer',async()=>{
  let finish;
  const service=createOcrService({recognizeImage:()=>new Promise(resolve=>{finish=resolve;})});
  const image=await png(),first=service.extract(image);
  while(!finish)await new Promise(resolve=>setTimeout(resolve,5));
  await expect(service.extract(image)).rejects.toMatchObject({code:'OCR_BUSY'});
  finish('Midterm 100%');await first;
  const broken=createOcrService({recognizeImage:async()=>{throw Error('timeout');}});
  await expect(broken.extract(image)).rejects.toMatchObject({code:'OCR_UNAVAILABLE'});
  await expect(broken.extract(image)).rejects.toMatchObject({code:'OCR_UNAVAILABLE'});
});
