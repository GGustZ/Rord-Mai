'use strict';
const express=require('express');
const multer=require('multer');
const {fail}=require('../../lib/errors');
const {MAX_BYTES}=require('../../services/ocr-service');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:1,headerPairs:100}}).single('image');
const createOcrRouter=({consentService,ocrService})=>{
  const router=express.Router();
  router.post('/ocr/syllabus',async(req,res)=>{
    if(!req.is('multipart/form-data'))throw fail('IMAGE_REQUIRED');
    const original=await consentService.withStorageConsent({identity:req.identity},ctx=>ctx.studentId);
    await new Promise((resolve,reject)=>upload(req,res,error=>error?reject(fail(error.code==='LIMIT_FILE_SIZE'?'IMAGE_TOO_LARGE':'IMAGE_REQUIRED')):resolve()));
    const draft=await ocrService.extract(req.file?.buffer);
    await consentService.withStorageConsent({identity:req.identity},ctx=>{
      if(ctx.studentId!==original)throw fail('RESOURCE_NOT_FOUND');
      res.json({data:draft});
    });
  });
  return router;
};
module.exports={createOcrRouter};
