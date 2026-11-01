import React,{useEffect,useState} from 'react';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
const grades=['A','B+','B','C+','C','D+','D','F'];
const format=n=>n==null?'ไม่มีค่าที่คำนวณได้':Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
export const Explanation=({api,enrollmentId,kind='summary',scenarios})=>{
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="card"><button className="secondary" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');setResult(null);
    try{setResult(await api('/enrollments/'+enrollmentId+'/explanation',{method:'POST',body:JSON.stringify({kind,...(scenarios?{scenarios}:{})})}));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }}>ดูคำอธิบายภาษาไทย</button>{error&&<p role="alert">{error}</p>}{result&&<><p lang="th" className="explanation" role="status">{result.text}</p><small>{result.source==='template'?'แม่แบบภายในระบบ':'ข้อความจาก AI พร้อมค่าคำนวณที่ตรวจสอบแล้ว'}</small></>}</div>;
};
export const GpaxView=({api})=>{
  const [profile,setProfile]=useState({currentGpa:'',creditsCounted:'',academicYear:new Date().getFullYear(),semester:1});
  const [courses,setCourses]=useState([]),[selected,setSelected]=useState(''),[outcomes,setOutcomes]=useState({}),[results,setResults]=useState(null),[comparison,setComparison]=useState(null),[scenarios,setScenarios]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const work=async fn=>{setBusy(true);setError('');setNotice('');try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}};
  useEffect(()=>{
    let active=true;
    (async()=>{
      let saved;
      try{saved=await api('/me/profile');}catch(e){if(e.status!==404)throw e;}
      const items=[];let cursor=null;
      do{const page=await api('/enrollments?limit=100'+(cursor?'&cursor='+encodeURIComponent(cursor):''));items.push(...page.items);cursor=page.nextCursor;}while(cursor);
      const all=await Promise.all(items.map(async item=>({...item,section:await api('/sections/'+item.sectionId),repeatDraft:item.repeat?.previousGradePoint??'none'})));
      if(active){if(saved)setProfile(saved);setCourses(all);setSelected(all[0]?.id||'');}
    })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[api]);
  const clear=()=>{setResults(null);setComparison(null);setScenarios(null);};
  return <><p>เปรียบเทียบตามเกรดสมมติที่คุณเลือก ผลนี้เป็นประมาณการ ไม่ใช่เกรดที่ทำนายหรือผลการเรียนอย่างเป็นทางการ</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form className="card" onSubmit={e=>{e.preventDefault();work(async()=>{
      const saved=await api('/me/profile',{method:'PUT',body:JSON.stringify(Object.fromEntries(Object.entries(profile).map(([k,v])=>[k,Number(v)])))});
      setProfile(saved);clear();setNotice('บันทึกข้อมูลผลการเรียนสะสมแล้ว');
    });}}><h3>ข้อมูลผลการเรียนสะสม</h3><p>ใช้ GPA สะสมและหน่วยกิตที่นับใน GPA นั้น ซึ่งอาจต่างจากจำนวนหน่วยกิตที่สอบผ่าน</p>
      {[['currentGpa','GPA สะสม',0,4,'any'],['creditsCounted','หน่วยกิตที่นับใน GPA',0,2147483647,1],['academicYear','ปีการศึกษา (ค.ศ.)',1,9999,1],['semester','ภาคเรียน',1,3,1]].map(([key,label,min,max,step])=><label key={key}>{label}<input required type="number" min={min} max={max} step={step} disabled={busy} value={profile[key]} onChange={e=>{clear();setProfile(p=>({...p,[key]:e.target.value}));}}/></label>)}<button disabled={busy}>บันทึกผลการเรียนสะสม</button>
    </form>
    <form onSubmit={e=>{e.preventDefault();work(async()=>{
      const base=courses.map(c=>({enrollmentId:c.id,outcome:outcomes[c.id]==='W'?'withdraw':'grade',...(outcomes[c.id]==='W'?{}:{grade:outcomes[c.id]})}));
      if(base.find(o=>o.enrollmentId===selected)?.outcome!=='grade')throw Error('กรุณาเลือกเกรดสมมติของรายวิชาที่ต้องการเปรียบเทียบ');
      const cases=[{label:'Stay',outcomes:base},{label:'Withdraw',outcomes:base.map(o=>o.enrollmentId===selected?{enrollmentId:o.enrollmentId,outcome:'withdraw'}:o)}];
      const result=await api('/gpax/scenarios',{method:'POST',body:JSON.stringify({scenarios:cases})});setResults(result.results);setComparison(result.comparison);setScenarios(cases);
    });}}><h3>เกรดสมมติ</h3>
      {!courses.length&&<p>กรุณาเพิ่มรายวิชาก่อนเปรียบเทียบ</p>}
      {courses.map(c=><div className="card" key={c.id}><h3>{c.section.courseCode} · {c.section.courseName}</h3><p>{c.section.credits} หน่วยกิต โปรดเลือกเกรดสมมติด้วยตนเอง แม้เป็นรายวิชาอิงกลุ่ม ระบบจะไม่ทำนายเกรด</p>
        <label>ผลการเรียนสมมติ<select required disabled={busy} value={outcomes[c.id]||''} onChange={e=>{clear();setOutcomes(old=>({...old,[c.id]:e.target.value}));}}><option value="" disabled>เลือกเกรดหรือ W</option>{[...grades,'W'].map(g=><option key={g}>{g}</option>)}</select></label>
        <label>แต้มเกรดเดิมของรายวิชาที่เรียนซ้ำ<select disabled={busy} value={c.repeatDraft} onChange={e=>{clear();setCourses(old=>old.map(item=>item.id===c.id?{...item,repeatDraft:e.target.value}:item));}}><option value="none">ไม่ใช่รายวิชาเรียนซ้ำ</option>{[0,1,1.5,2,2.5,3,3.5,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <button type="button" className="secondary" disabled={busy} onClick={()=>work(async()=>{
          const saved=await api('/enrollments/'+c.id,{method:'PATCH',body:JSON.stringify({repeat:c.repeatDraft==='none'?null:{previousGradePoint:Number(c.repeatDraft)}})});
          clear();setCourses(old=>old.map(item=>item.id===c.id?{...item,repeat:saved.repeat}:item));setNotice('บันทึกข้อมูลเรียนซ้ำแล้ว ยังไม่คำนวณ GPAX สำหรับการเรียนซ้ำจนกว่าจะยืนยันกฎอย่างเป็นทางการ');
        })}>บันทึกข้อมูลเรียนซ้ำ</button></div>)}
      {courses.length>0&&<><label>รายวิชาที่ต้องการเปรียบเทียบ<select required disabled={busy} value={selected} onChange={e=>{clear();setSelected(e.target.value);}}>{courses.map(c=><option key={c.id} value={c.id}>{c.section.courseCode} · กลุ่มเรียน {c.section.sectionNumber}</option>)}</select></label><button disabled={busy}>เปรียบเทียบเรียนต่อกับถอนรายวิชา</button></>}
    </form>
    {results&&<><div className="columns">{results.map((r,i)=><div className="card" key={r.label}><h3>{i===0?'เรียนต่อ':'ถอนรายวิชา'}</h3><strong>GPAX {format(r.gpax)}</strong><p>หน่วยกิตที่นับใน GPA: {r.creditsCounted}</p></div>)}</div>
      <p role="status">ส่วนต่าง GPAX (ถอนลบเรียนต่อ): {format(comparison?.delta)}</p>
      {results.every(r=>r.gpax!==null)&&<figure className="card" aria-label="กราฟเปรียบเทียบ GPAX"><figcaption>ประมาณการ GPAX เมื่อเรียนต่อและถอนรายวิชา</figcaption><div style={{width:'100%',height:240,minWidth:0}}>
        <ResponsiveContainer width="100%" height="100%"><BarChart accessibilityLayer data={results.map((r,i)=>({name:i===0?'เรียนต่อ':'ถอนรายวิชา',gpax:r.gpax}))}><XAxis dataKey="name"/><YAxis domain={[0,4]}/><Tooltip formatter={value=>[format(value),'GPAX']}/><Bar dataKey="gpax" fill="#177568" isAnimationActive={false}/></BarChart></ResponsiveContainer>
      </div></figure>}
      <p lang="th" className="message">{results[0].disclaimer}</p><ul lang="th">{results[0].assumptions.map(s=><li key={s}>{s}</li>)}</ul>
      <aside className="card" aria-labelledby="withdrawal-considerations"><h3 id="withdrawal-considerations">สิ่งที่ควรพิจารณาก่อนถอนรายวิชา</h3><ul>
        <li>หน่วยกิต: การถอนทำให้ไม่ได้หน่วยกิตของรายวิชานี้ และอาจทำให้หน่วยกิตสำเร็จการศึกษาไม่ครบตามแผน</li>
        <li>วิชาต่อเนื่อง: ตรวจสอบว่ารายวิชานี้เป็นวิชาบังคับก่อนของวิชาอื่นหรือไม่ เพราะอาจกระทบแผนการเรียน</li>
        <li>การเปิดสอน: ตรวจสอบภาคเรียนที่เปิดสอนครั้งถัดไปและที่นั่งก่อนวางแผนลงทะเบียนใหม่</li>
        <li>ค่าใช้จ่าย: ตรวจสอบเงื่อนไขคืนค่าธรรมเนียมและค่าใช้จ่ายในการลงทะเบียนครั้งถัดไปกับมหาวิทยาลัย</li>
      </ul><p>ผลนี้เป็นประมาณการ ไม่ใช่คำแนะนำให้ถอนรายวิชา โปรดปรึกษาอาจารย์ที่ปรึกษา</p></aside>
      <Explanation key={JSON.stringify(scenarios)} api={api} enrollmentId={selected} kind="withdrawal" scenarios={scenarios}/></>}
  </>;
};
export const SyllabusUpload=({api,onConfirm,disabled})=>{
  const [draft,setDraft]=useState(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const total=draft?.components.reduce((sum,c)=>sum+Math.round(Number(c.weightPercent)*100),0);
  const change=(index,key,value)=>{setChecked(false);setDraft(old=>({...old,components:old.components.map((c,i)=>i===index?{...c,[key]:value}:c)}));};
  return <div className="card"><h3>อ่านภาพประมวลรายวิชา</h3><p>เลือกอัปโหลดภาพ PNG/JPG ได้ ไม่รองรับ PDF และยังกรอกข้อมูลด้วยตนเองด้านล่างได้</p>
    <label>ภาพประมวลรายวิชา<input type="file" accept="image/png,image/jpeg" disabled={disabled||busy} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value='';setDraft(null);setChecked(false);setError('');if(!file)return;
      if(!['image/png','image/jpeg'].includes(file.type)){setError('กรุณาเลือกภาพ PNG หรือ JPEG ไม่รองรับ PDF');return;}
      if(file.size>5*1024*1024){setError('ขนาดไฟล์สูงสุด 5 MiB');return;}
      const body=new FormData();body.append('image',file);setBusy(true);
      try{setDraft(await api('/ocr/syllabus',{method:'POST',body}));}catch(err){setError(err.message);}finally{setBusy(false);}
    }}/></label>{busy&&<p role="status">กำลังอ่านภาพ…</p>}{error&&<p role="alert" className="error">{error}</p>}
    {draft&&<><ul lang="th">{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
      {draft.components.map((c,i)=><fieldset className="card" key={i}><legend>รายการประเมินที่อ่านได้ {i+1}</legend><label>ชื่อรายการ<input value={c.name} maxLength="100" onChange={e=>change(i,'name',e.target.value)}/></label><label>น้ำหนัก (%)<input type="number" min="0.01" max="100" step="0.01" value={c.weightPercent} onChange={e=>change(i,'weightPercent',e.target.value)}/></label><label>คะแนนเต็ม<input type="number" min="0.01" step="any" value={c.maximumScore} onChange={e=>change(i,'maximumScore',e.target.value)}/></label><label>ประเภทข้อมูล<select value={c.inputType} onChange={e=>change(i,'inputType',e.target.value)}><option value="marks">คะแนน</option><option value="attendance">การเข้าเรียน</option></select></label></fieldset>)}
      <p role="status">ผลรวมน้ำหนักที่อ่านได้: {format(total/100)}%</p><label className="check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>ฉันตรวจสอบค่าที่อ่านได้ทุกรายการกับประมวลรายวิชาแล้ว</label>
      <button type="button" disabled={disabled||!checked||total!==10000||draft.components.some(c=>!c.name.trim()||!Number.isFinite(Number(c.maximumScore))||Number(c.maximumScore)<=0||Number(c.weightPercent)<=0)} onClick={()=>{onConfirm(draft.components.map(c=>({...c,weightPercent:Number(c.weightPercent),maximumScore:Number(c.maximumScore)})));setDraft(null);setChecked(false);}}>ใช้ข้อมูลที่ตรวจสอบแล้ว</button><button type="button" className="secondary" onClick={()=>{setDraft(null);setChecked(false);}}>ทิ้งร่างจากภาพ</button><small>ระบบจะยังไม่บันทึกข้อมูลจนกว่าคุณจะสร้างกลุ่มเรียนเสร็จ</small>
    </>}
  </div>;
};
