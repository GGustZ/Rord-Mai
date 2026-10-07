'use strict';
const createGemini = ({ apiKey,model,fetchImpl=fetch }) => {
  if(!apiKey||!model)return null;
  if(!/^[A-Za-z0-9._-]+$/.test(model))throw new TypeError('Invalid Gemini model.');
  return async payload => {
    const response=await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,{
      method:'POST',signal:AbortSignal.timeout(5000),redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},
      body:JSON.stringify({contents:[{parts:[{text:'เขียนคำอธิบายภาษาไทยจากข้อมูลคำนวณนี้เท่านั้น ห้ามแนะนำให้ถอนรายวิชา ห้ามใส่ตัวเลขเอง ใช้ {{ชื่อmetric}} สำหรับค่าทุกค่าใน metrics และกล่าวถึงทุก metric ห้ามใส่ชื่อบุคคลหรือรายวิชา คืน JSON ที่มี text เท่านั้น: '+JSON.stringify(payload)}]}],
        generationConfig:{responseMimeType:'application/json',responseSchema:{type:'OBJECT',properties:{text:{type:'STRING'}},required:['text']},maxOutputTokens:1024}}),
    });
    if(!response.ok)throw new Error('Explanation provider unavailable.');
    const body=await response.json();
    const raw=body.candidates?.[0]?.content?.parts?.filter(p=>!p.thought).map(p=>p.text||'').join('');
    if(typeof raw!=='string'||raw.length>8000)throw new Error('Invalid explanation.');
    const value=JSON.parse(raw);
    if(!value||Object.keys(value).length!==1||typeof value.text!=='string')throw new Error('Invalid explanation.');
    return value.text;
  };
};
module.exports={createGemini};
