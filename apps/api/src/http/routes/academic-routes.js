const express=require('express');
const {fail}=require('../../lib/errors');
const { validateCreateSectionBody } = require('../middleware/validate-create-section');
const { validateJoinSection } = require('../middleware/validate-join-section');
const createAcademicRouter=(service)=>{
  const router=express.Router();
  router.post('/sections',validateCreateSectionBody,async(req,res)=>{
    const result=await service.createSection({identity:req.identity,input:req.validated});
    res.status(201).location('/api/v1/sections/'+result.section.id).json({data:result});
  });
  router.post('/sections/join',validateJoinSection,async(req,res)=>{
    res.status(201).json({data:await service.joinSection({identity:req.identity,code:req.validated.joinCode})});
  });
  router.get('/sections/:sectionId',async(req,res)=>res.json({data:await service.getSection({identity:req.identity,sectionId:req.params.sectionId})}));
  router.patch('/sections/:sectionId/grading-structure',async(req,res)=>res.json({data:await service.reviseWeights({identity:req.identity,sectionId:req.params.sectionId,input:req.body})}));
  router.get('/enrollments/:enrollmentId',async(req,res)=>res.json({data:await service.detail({identity:req.identity,enrollmentId:req.params.enrollmentId})}));
  router.patch('/enrollments/:enrollmentId',async(req,res)=>res.json({data:await service.updateTarget({identity:req.identity,enrollmentId:req.params.enrollmentId,input:req.body})}));
  router.get('/enrollments/:enrollmentId/summary',async(req,res)=>res.json({data:await service.summary({identity:req.identity,enrollmentId:req.params.enrollmentId})}));
  router.post('/enrollments/:enrollmentId/target-calculation',async(req,res)=>{
    if(!req.body||Array.isArray(req.body)||Object.keys(req.body).length!==1||!Object.hasOwn(req.body,'targetGrade')) throw fail('VALIDATION_ERROR');
    res.json({data:await service.summary({identity:req.identity,enrollmentId:req.params.enrollmentId,targetGrade:req.body.targetGrade})});
  });
  for(const [route,kind] of [['scores','score'],['attendance','attendance']]) {
    router.put('/enrollments/:enrollmentId/'+route+'/:componentId',async(req,res)=>res.json({data:await service.writeComponent({
      identity:req.identity,...req.params,input:req.body,kind,
    })}));
    router.delete('/enrollments/:enrollmentId/'+route+'/:componentId',async(req,res)=>{
      if(req.body!==undefined&&(!req.body||Array.isArray(req.body)||Object.keys(req.body).length)) throw fail('VALIDATION_ERROR');
      await service.writeComponent({identity:req.identity,...req.params,kind,remove:true});res.status(204).end();
    });
  }
  return router;
};
module.exports = { createAcademicRouter };
