'use strict';
const {calculationInput}=require('./academic-service');
const {targetCalculation}=require('../adapters/engine');
const notificationCard=(detail,liffId)=>{
  const result=targetCalculation(calculationInput(detail),detail.enrollment.targetGrade);
  const text=(value,color='#334155',weight='regular',size='sm')=>({type:'text',text:String(value),color,weight,size,wrap:true});
  const link=view=>'https://liff.line.me/'+liffId+'/?view='+view+'&enrollmentId='+encodeURIComponent(detail.enrollment.id);
  return {type:'flex',altText:'Academic Risk Alert: '+detail.section.courseCode,contents:{type:'bubble',
    header:{type:'box',layout:'vertical',backgroundColor:'#b65a00',paddingAll:'20px',contents:[text('Academic Risk Alert','#ffffff','bold','lg')]},
    body:{type:'box',layout:'vertical',spacing:'md',contents:[
      text('COURSE UNDER REVIEW','#64748b','bold','xs'),text(detail.section.courseName,'#172033','bold','lg'),
      text(detail.section.courseCode+' · '+detail.section.credits+' credits'),
      {type:'box',layout:'horizontal',backgroundColor:'#f7f8fa',paddingAll:'14px',cornerRadius:'12px',contents:[
        {type:'box',layout:'vertical',contents:[text('CURRENT SCORE','#64748b','regular','xs'),text(Number(result.currentWeightedScore.toFixed(2))+' / 100','#c72b45','bold','xl')]},
        {type:'box',layout:'vertical',contents:[text('TARGET GRADE','#64748b','regular','xs'),text(detail.enrollment.targetGrade,'#172033','bold','xl')]}
      ]},
      text('Target is not achievable with the currently recorded scores.','#9a4d05','bold'),
      text('Review your entries before the withdrawal deadline: '+detail.section.withdrawalDeadline),
      text('RordMai calculates scenarios only. This is not advice to withdraw. Consult your academic adviser.','#64748b','regular','xs')
    ]},
    footer:{type:'box',layout:'vertical',spacing:'sm',contents:[
      {type:'button',style:'primary',color:'#087d3e',action:{type:'uri',label:'View Course Progress',uri:link('course')}},
      {type:'button',style:'secondary',action:{type:'uri',label:'Compare Scenarios',uri:link('gpax')}}
    ]}
  }};
};
module.exports={notificationCard};
