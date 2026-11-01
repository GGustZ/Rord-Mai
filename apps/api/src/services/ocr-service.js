'use strict';
const sharp=require('sharp');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {fail}=require('../lib/errors');
const execute=promisify(execFile);
const MAX_BYTES=5*1024*1024,MAX_PIXELS=10000000;
const parseSyllabus=text=>{
  const components=[],warnings=['Check every assessment name, weight, maximum score and input type before confirming.'];
  const normalized=text.replace(/[๐-๙]/g,c=>String(c.charCodeAt(0)-'๐'.charCodeAt(0)));
  for(const line of normalized.split(/\r?\n/)){
    // ponytail: explicit percentage rows only; add layout-aware parsing after real syllabus fixtures show a need.
    const matches=[...line.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:%|เปอร์เซ็นต์|ร้อยละ)/g)];
    if(matches.length!==1){if(matches.length>1)warnings.push('Rows with multiple percentages were skipped. Check the image.');continue;}
    const match=matches[0],weightPercent=Number(match[1].replace(',','.'));
    const name=line.slice(0,match.index).replace(/^[\s|•\-\d.()]+/,'').replace(/[|:\s]+$/,'').trim();
    if(!name||/^(?:total|รวม)/i.test(name)||weightPercent<=0||weightPercent>100)continue;
    if(name.length>100||components.some(c=>c.name===name)){warnings.push('พบชื่อรายการซ้ำหรือยาวexcessไป กรุณาแก้ไขด้วยตนเอง');continue;}
    components.push({name,weightPercent,maximumScore:100,inputType:'marks'});
    if(components.length>30)throw fail('EXTRACTION_FAILED');
  }
  if(!components.length)throw fail('EXTRACTION_FAILED');
  if(components.reduce((sum,c)=>sum+Math.round(c.weightPercent*100),0)!==10000)warnings.push('Extracted weights do not total 100%. Correct them before saving.');
  warnings.push('Maximum scores default to 100 and input types to marks. Verify these against the syllabus, especially attendance.');
  return {components,warnings,requiresConfirmation:true};
};
const recognize=async(file,executable)=>{
  const {stdout}=await execute(executable,[file,'stdout','-l','tha+eng','--psm','6'],{
    timeout:30000,maxBuffer:1024*1024,windowsHide:true,
  });
  return stdout;
};
const createOcrService=({executable='tesseract',recognizeImage=recognize}={})=>{
  let busy=false;
  return {extract:async buffer=>{
    if(!Buffer.isBuffer(buffer)||!buffer.length)throw fail('IMAGE_REQUIRED');
    if(buffer.length>MAX_BYTES)throw fail('IMAGE_TOO_LARGE');
    // Verify a supported file signature before invoking any image decoder.
    const png=buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg=buffer[0]===255&&buffer[1]===216&&buffer[2]===255;
    if(!png&&!jpeg)throw fail('IMAGE_REQUIRED');
    if(busy)throw fail('OCR_BUSY');
    busy=true;
    let directory;
    try{
      let metadata;
      try{metadata=await sharp(buffer,{limitInputPixels:false}).metadata();}catch{throw fail('IMAGE_REQUIRED');}
      if(!['png','jpeg'].includes(metadata.format)||(metadata.pages??1)!==1)throw fail('IMAGE_REQUIRED');
      if(!metadata.width||!metadata.height||metadata.width*metadata.height>MAX_PIXELS)throw fail('IMAGE_TOO_LARGE');
      let image;
      try{image=await sharp(buffer,{limitInputPixels:MAX_PIXELS,failOn:'warning'}).rotate().grayscale().png().toBuffer();}
      catch{throw fail('IMAGE_REQUIRED');}
      directory=await fs.mkdtemp(path.join(os.tmpdir(),'rordmai-ocr-'));
      const file=path.join(directory,'syllabus.png');
      await fs.writeFile(file,image,{mode:0o600});
      let text;
      try{text=await recognizeImage(file,executable);}catch{throw fail('OCR_UNAVAILABLE');}
      return parseSyllabus(text);
    }finally{
      try{
        if(directory){
          if(path.dirname(directory)!==path.resolve(os.tmpdir())||!path.basename(directory).startsWith('rordmai-ocr-'))throw new Error('Invalid OCR cleanup path.');
          await fs.rm(directory,{recursive:true,force:true});
        }
      }finally{busy=false;}
    }
  }};
};
module.exports={createOcrService,parseSyllabus,MAX_BYTES,MAX_PIXELS};
