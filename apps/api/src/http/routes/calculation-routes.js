const express=require('express');
const {summarize,target}=require('../../../../../packages/engine/src');
const createCalculationRouter=()=>{
  const router=express.Router();
  let windowStart=Date.now(),requests=0;
  router.use((req,res,next)=>{
    res.set('Access-Control-Allow-Origin','*');
    res.set('Access-Control-Allow-Methods','POST, OPTIONS');
    res.set('Access-Control-Allow-Headers','Content-Type');
    res.set('Access-Control-Expose-Headers','Retry-After');
    if(req.method==='OPTIONS')return res.sendStatus(204);
    // shortcut: shared per-process budget; use a shared limiter when deploying multiple instances.
    if(Date.now()-windowStart>=60000){windowStart=Date.now();requests=0;}
    if(++requests>120)return res.set('Retry-After',String(Math.max(1,Math.ceil((60000-Date.now()+windowStart)/1000)))).status(429).json({error:{code:'RATE_LIMITED',message:'Calculation capacity reached. Retry shortly.'}});
    next();
  });
  router.use(express.json({limit:'16kb'}));
  const object=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(key=>keys.includes(key));
  for(const kind of ['summary','target'])router.post('/'+kind,(req,res)=>{
    if(!req.is('application/json'))return res.status(415).json({error:{code:'UNSUPPORTED_MEDIA_TYPE',message:'Use application/json.'}});
    const input=req.body;
    try{
      if(!object(input,['components','gradingMode','gradeThresholds',...(kind==='target'?['targetPercent']:[])])||!Array.isArray(input.components)||input.components.length<1||input.components.length>30)throw new TypeError('Supply 1 to 30 components.');
      for(const c of input.components)if(!object(c,['id','weightPercent','maximumScore','score'])||typeof c.id!=='string'||!c.id.trim()||c.id.length>100)throw new TypeError('Invalid component fields or ID.');
      if(kind==='target'&&input.gradingMode==='norm')throw new TypeError('Target calculations require criterion grading.');
      const data=kind==='summary'?summarize(input):target(input,input.targetPercent);
      return res.json({data});
    }catch(error){if(!(error instanceof TypeError))throw error;return res.status(400).json({error:{code:'VALIDATION_ERROR',message:error.message}});}
  });
  router.use((_req,res)=>res.status(404).json({error:{code:'ROUTE_NOT_FOUND',message:'Unknown calculation endpoint.'}}));
  return router;
};
module.exports={createCalculationRouter};
