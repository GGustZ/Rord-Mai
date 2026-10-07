'use strict';
const { createHmac, timingSafeEqual } = require('node:crypto');

const verifySignature = (body, signature, secret) => {
  if (!Buffer.isBuffer(body) || typeof signature !== 'string' || !secret ||
      !/^[A-Za-z0-9+/]{43}=$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(body).digest();
  const supplied = Buffer.from(signature, 'base64');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
};

const quickReplies = text => {
  const choices=[...text.matchAll(/^([1-8])\. (.+)$/gm)].map(match=>({label:Array.from(match[1]+'. '+match[2]).slice(0,20).join(''),text:match[1]}));
  const commands=['score','summary','cancel',...(text.includes('Send next')?['next']:[]),...(text.includes('confirm')?['confirm','edit']:[])];
  return {items:[...choices,...commands.map(command=>({label:command,text:command}))].slice(0,13)
    .map(action=>({type:'action',action:{type:'message',...action}}))};
};
const createLineMessaging = ({ accessToken, fetchImpl = fetch }) => ({
  push: async (userId,text,retryKey) => {
    let response;
    try {
      response=await fetchImpl('https://api.line.me/v2/bot/message/push',{
        method:'POST',signal:AbortSignal.timeout(5000),redirect:'error',
        headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json','X-Line-Retry-Key':retryKey},
        body:JSON.stringify({to:userId,messages:[{type:'text',text}]}),
      });
    }catch{throw Object.assign(new Error('LINE push unavailable.'),{retryable:true});}
    if(response.ok||(response.status===409&&response.headers.get('x-line-accepted-request-id')))return;
    throw Object.assign(new Error('LINE push rejected.'),{retryable:response.status>=500||response.status===429});
  },
  reply: async (replyToken, text) => {
    const response = await fetchImpl('https://api.line.me/v2/bot/message/reply', {
      method: 'POST', signal: AbortSignal.timeout(5000), redirect:'error',
      headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: text.slice(0, 4500),quickReply:quickReplies(text) }] }),
    });
    // Never include provider bodies, tokens or private messages in application logs/errors.
    if (!response.ok) throw new Error('LINE reply failed. Check LIFF before restarting chat.');
  },
});

module.exports = { verifySignature, createLineMessaging, quickReplies };
