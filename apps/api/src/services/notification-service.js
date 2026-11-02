'use strict';
const {createAcademicService,calculationInput}=require('./academic-service');
const {targetCalculation}=require('../adapters/engine');
const {notificationCard}=require('./notification-card');
const deadlineCutoff=date=>new Date(date+'T23:59:59.999+07:00');
const eligible=(detail,now)=>detail.section.gradingMode==='criterion'&&detail.enrollment.targetGrade!==null&&
  now<deadlineCutoff(detail.section.withdrawalDeadline)&&!targetCalculation(calculationInput(detail),detail.enrollment.targetGrade).reachable;
const createNotificationService=({pool,consentService,messaging,liffId,now=()=>new Date()})=>{
  const academicFor=ctx=>createAcademicService({consentService:{withStorageConsent:async(_args,work)=>work(ctx)}});
  const run=async()=>{
    const lock=await pool.connect();
    let locked=false;
    const counts={sent:0,failed:0,cancelled:0};
    try{
      locked=(await lock.query('SELECT pg_try_advisory_lock(713146,2) AS locked')).rows[0].locked;
      if(!locked)return {...counts,busy:true,nextRetryAt:null};
      // ponytail: sequential delivery for the DME pilot; partition by student if throughput grows.
      const candidates=(await pool.query(`SELECT e.id,e.student_id,e.section_id,u.line_user_id FROM enrollments e
        JOIN students u ON u.id=e.student_id JOIN sections s ON s.id=e.section_id
        LEFT JOIN deadline_notifications n ON n.student_id=e.student_id AND n.section_id=e.section_id
        WHERE u.storage_consent AND e.target_grade IS NOT NULL AND s.grading_mode='criterion'
        AND ((s.withdrawal_deadline+1)::timestamp AT TIME ZONE 'Asia/Bangkok')>$1
        AND (n.id IS NULL OR (n.status='pending' AND n.next_attempt_at<=$1)) ORDER BY e.student_id,e.section_id`,[now()])).rows;
      for(const candidate of candidates){
        const identity={lineUserId:candidate.line_user_id};
        try{
          // Persist key/body/attempt BEFORE network delivery. A crash uses the same key, never a new send.
          const notification=await consentService.withStorageConsent({identity},async ctx=>{
            if(ctx.studentId!==candidate.student_id)return null;
            const d=await academicFor(ctx).detail({enrollmentId:candidate.id});
            const existing=(await ctx.client.query('SELECT * FROM deadline_notifications WHERE student_id=$1 AND section_id=$2 FOR UPDATE',[ctx.studentId,candidate.section_id])).rows[0];
            if(existing&&(existing.status!=='pending'||new Date(existing.next_attempt_at)>now()))return null;
            if(!eligible(d,now())){
              if(existing)await ctx.client.query("UPDATE deadline_notifications SET status='cancelled' WHERE id=$1",[existing.id]);
              return null;
            }
            const message=`Your saved target for ${d.section.courseCode} is not achievable with the recorded scores. Review your entries before ${d.section.withdrawalDeadline}. This is not advice to withdraw.\nhttps://liff.line.me/${liffId}`;
            const record=existing||(await ctx.client.query(`INSERT INTO deadline_notifications(student_id,section_id,message,message_payload)
              VALUES ($1,$2,$3,$4) RETURNING *`,[ctx.studentId,candidate.section_id,message,notificationCard(d,liffId)])).rows[0];
            if(record.attempts>=3){await ctx.client.query("UPDATE deadline_notifications SET status='failed' WHERE id=$1",[record.id]);return null;}
            const next=new Date(now().getTime()+(record.attempts===0?60000:300000));
            return (await ctx.client.query('UPDATE deadline_notifications SET attempts=attempts+1,next_attempt_at=$2 WHERE id=$1 RETURNING *',[record.id,next])).rows[0];
          });
          if(!notification)continue;
          await consentService.withStorageConsent({identity},async ctx=>{
            if(ctx.studentId!==candidate.student_id)return;
            const record=(await ctx.client.query('SELECT * FROM deadline_notifications WHERE id=$1 AND student_id=$2 FOR UPDATE',[notification.id,ctx.studentId])).rows[0];
            if(!record||record.status!=='pending')return;
            const d=await academicFor(ctx).detail({enrollmentId:candidate.id});
            if(!eligible(d,now())){
              await ctx.client.query("UPDATE deadline_notifications SET status='cancelled' WHERE id=$1",[record.id]);counts.cancelled++;return;
            }
            // Student lock covers the bounded send, so withdrawal cannot race delivery.
            try{
              await messaging.push(identity.lineUserId,record.message_payload||record.message,record.retry_key);
              await ctx.client.query("UPDATE deadline_notifications SET status='sent' WHERE id=$1",[record.id]);counts.sent++;
            }catch(error){
              if(!error.retryable||record.attempts>=3){
                await ctx.client.query("UPDATE deadline_notifications SET status='failed' WHERE id=$1",[record.id]);counts.failed++;
              }
            }
          });
        }catch(error){if(!['STORAGE_CONSENT_REQUIRED','RESOURCE_NOT_FOUND'].includes(error.code))throw error;}
      }
      await pool.query(`UPDATE deadline_notifications n SET status='cancelled' FROM sections s
        WHERE n.section_id=s.id AND n.status='pending' AND ((s.withdrawal_deadline+1)::timestamp AT TIME ZONE 'Asia/Bangkok')<=$1`,[now()]);
      const next=(await pool.query("SELECT min(next_attempt_at) AS next FROM deadline_notifications WHERE status='pending' AND attempts<3")).rows[0].next;
      return {...counts,busy:false,nextRetryAt:next?new Date(next).toISOString():null};
    }finally{
      let error;
      if(locked)try{await lock.query('SELECT pg_advisory_unlock(713146,2)');}catch(e){error=e;}
      lock.release(error);
    }
  };
  return {run};
};
module.exports={createNotificationService,deadlineCutoff,eligible};
