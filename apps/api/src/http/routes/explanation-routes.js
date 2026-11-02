'use strict';
const express=require('express');
const createExplanationRouter=service=>{
  const router=express.Router();
  router.post('/enrollments/:enrollmentId/explanation',async(req,res)=>res.json({data:await service.explain({identity:req.identity,enrollmentId:req.params.enrollmentId,input:req.body})}));
  return router;
};
module.exports={createExplanationRouter};
