const request = require('supertest');
const { createApp } = require('../src/app');
const { createAcademicService } = require('../src/services/academic-service');
const { validateCreateSection } = require('../src/lib/validate-create-section');
const section = () => ({courseCode:'TEST',courseName:'Test',sectionNumber:'1',academicYear:2026,semester:1,credits:3,
  gradingMode:'norm',gradeThresholds:null,withdrawalDeadline:'2026-10-31',components:[
    {name:'Work',weightPercent:40,maximumScore:100,inputType:'marks'},
    {name:'Exam',weightPercent:60,maximumScore:100,inputType:'marks'}]});
test.each([[35,95,'ขาด 5%'],[45,105,'เกิน 5%'],[39.99,99.99,'ขาด 0.01%']])('create and revision explain total %s',async(weight,total,gap)=>{
  const input=section();input.components[0].weightPercent=weight;
  const expected=`ผลรวมน้ำหนัก ${total}%; ${gap}. น้ำหนักต้องรวมเป็น 100%.`;
  expect(validateCreateSection(input).errors).toContainEqual({path:'components',message:expected});
  const consentService={withStorageConsent:jest.fn()};
  const academicService=createAcademicService({consentService});
  const app=createApp({consentService,academicService,verifyIdentity:async()=>({lineUserId:'trusted'})});
  const response=await request(app).patch('/api/v1/sections/11111111-1111-4111-8111-111111111111/grading-structure')
    .set('Authorization','Bearer test-only').send({expectedRevision:1,components:input.components.map((c,i)=>({id:`22222222-2222-4222-8222-22222222222${i}`,weightPercent:c.weightPercent}))});
  expect(response.status).toBe(400);
  expect(response.body.error.details).toEqual([{path:'components',message:expected}]);
  expect(consentService.withStorageConsent).not.toHaveBeenCalled();
});
