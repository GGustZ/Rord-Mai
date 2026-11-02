'use strict';
const express=require('express');
const createGpaxRouter = service => {
  const router=express.Router();
  router.get('/me/profile',async(req,res)=>res.json({data:await service.getProfile({identity:req.identity})}));
  router.put('/me/profile',async(req,res)=>res.json({data:await service.saveProfile({identity:req.identity,input:req.body})}));
  router.post('/gpax/scenarios',async(req,res)=>res.json({data:await service.calculate({identity:req.identity,input:req.body})}));
  return router;
};
module.exports={createGpaxRouter};
