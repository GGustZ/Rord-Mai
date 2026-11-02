'use strict';
const express=require('express');
const multer=require('multer');
const {fail}=require('../../lib/errors');
const {MAX_BYTES}=require('../../services/ocr-service');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_BYTES,files:1,fields:0,parts:1,headerPairs:100}}).single('image');
const createOcrRouter=({consentService,ocrService})=>{
  const router=express.Router();
  let uploading=false;
  router.post('/ocr/syllabus',async(req,res)=>{
    if(!req.is('multipart/form-data'))throw fail('IMAGE_REQUIRED');
    const original=await consentService.withStorageConsent({identity:req.identity},ctx=>ctx.studentId);
    if(req.aborted||req.destroyed)throw fail('IMAGE_REQUIRED');
    if(uploading){req.resume();throw fail('OCR_BUSY');}
    uploading=true;
    try{
      await new Promise((resolve,reject)=>{
        let settled=false;
        const finish=error=>{
          if(settled)return;
          settled=true;
          clearTimeout(uploadDeadline);req.off('aborted',aborted);
          error?reject(error):resolve();
        };
        const aborted=()=>finish(fail('IMAGE_REQUIRED'));
        // Settling explicitly also releases the slot when an abort event was already missed.
        const uploadDeadline=setTimeout(()=>{aborted();req.destroy();},30000);
        uploadDeadline.unref();
        req.once('aborted',aborted);
        if(req.aborted||req.destroyed){aborted();return;}
        upload(req,res,error=>finish(error?fail(error.code==='LIMIT_FILE_SIZE'?'IMAGE_TOO_LARGE':'IMAGE_REQUIRED'):null));
      });
      const draft=await ocrService.extract(req.file?.buffer);
      await consentService.withStorageConsent({identity:req.identity},ctx=>{
        if(ctx.studentId!==original)throw fail('RESOURCE_NOT_FOUND');
        res.json({data:draft});
      });
    }finally{uploading=false;}
  });
  return router;
};
module.exports={createOcrRouter};
