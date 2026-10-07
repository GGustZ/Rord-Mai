'use strict';
const {createPool}=require('../apps/api/src/db/pool');
const {createConsentService}=require('../apps/api/src/services/consent-service');
const {createLineMessaging}=require('../apps/api/src/adapters/line-messaging');
const {createNotificationService}=require('../apps/api/src/services/notification-service');
const main=async()=>{
  for(const key of ['DATABASE_URL','LINE_CHANNEL_ACCESS_TOKEN','LIFF_ID','STORAGE_POLICY_VERSION'])
    if(!process.env[key]?.trim())throw new Error('Missing notification configuration.');
  const pool=createPool(process.env.DATABASE_URL);
  try{
    const service=createNotificationService({pool,liffId:process.env.LIFF_ID,
      consentService:createConsentService({pool,currentPolicyVersion:process.env.STORAGE_POLICY_VERSION}),
      messaging:createLineMessaging({accessToken:process.env.LINE_CHANNEL_ACCESS_TOKEN})});
    const until=Date.now()+10*60000;
    do{
      const result=await service.run();
      console.log(JSON.stringify(result)); // Counts/times only, no identities or academic data.
      if(result.failed)process.exitCode=1;
      if(!result.nextRetryAt||result.busy||Date.now()>=until)break;
      await new Promise(resolve=>setTimeout(resolve,Math.max(1000,Math.min(60000,new Date(result.nextRetryAt)-Date.now()))));
    }while(Date.now()<until);
  }finally{await pool.end();}
};
main().catch(()=>{console.error('Deadline alerts failed. Check protected configuration and database availability.');process.exitCode=1;});
