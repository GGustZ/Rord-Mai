const request=require('supertest');
const {createApp}=require('../src/app');
const input={components:[{id:'assignment',weightPercent:40,maximumScore:20,score:16},{id:'exam',weightPercent:60,maximumScore:100,score:null}],gradingMode:'criterion',gradeThresholds:{A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50}};
test('outsiders calculate without identity while private routes remain protected',async()=>{
 const app=createApp();
 const summary=await request(app).post('/api/v1/calculations/summary').send(input);
 expect(summary.status).toBe(200);expect(summary.body.data).toMatchObject({currentWeightedScore:32,remainingWeight:60,maximumPossibleScore:92,projectedGrade:null});
 const target=await request(app).post('/api/v1/calculations/target').send({...input,targetPercent:80});expect(target.body.data).toMatchObject({requiredRemainingPercent:80,reachable:true});
 expect((await request(app).get('/api/v1/consents')).status).toBe(401);
 expect((await request(app).get('/api-docs')).status).toBe(200);
});
test('public browser preflight and invalid inputs',async()=>{
 const app=createApp();const preflight=await request(app).options('/api/v1/calculations/summary').set('Origin','https://example.org');expect(preflight.status).toBe(204);expect(preflight.headers['access-control-allow-origin']).toBe('*');
 for(const body of [null,[],{}, {...input,extra:true},{...input,components:[null]},{...input,components:[{...input.components[0],score:21}]},{...input,components:Array(31).fill(input.components[0])}])expect((await request(app).post('/api/v1/calculations/summary').set('Content-Type','application/json').send(JSON.stringify(body))).status).toBe(400);
 expect((await request(app).post('/api/v1/calculations/target').send({...input,gradingMode:'norm',gradeThresholds:null,targetPercent:80})).status).toBe(400);
 expect((await request(app).post('/api/v1/calculations/summary').send('text')).status).toBe(415);
 expect((await request(app).post('/api/v1/calculations/summary').send({text:'x'.repeat(17000)})).status).toBe(413);
});
test('shared request budget returns retry guidance',async()=>{
 const app=createApp();for(let n=0;n<120;n++)await request(app).post('/api/v1/calculations/summary').send(input);
 const response=await request(app).post('/api/v1/calculations/summary').send(input);expect(response.status).toBe(429);expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
});
