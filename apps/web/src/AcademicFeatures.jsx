import React,{useEffect,useState} from 'react';
import {Icon} from './Interface.jsx';
import {BarChart,Bar,XAxis,YAxis,Tooltip,ResponsiveContainer} from 'recharts';
const grades=['A','B+','B','C+','C','D+','D','F'];
const format=n=>n==null?'Not available':Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
export const Explanation=({api,enrollmentId,kind='summary',scenarios})=>{
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="card"><button className="secondary" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');setResult(null);
    try{setResult(await api('/enrollments/'+enrollmentId+'/explanation',{method:'POST',body:JSON.stringify({kind,...(scenarios?{scenarios}:{})})}));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }}>View Thai explanation</button>{error&&<p role="alert">{error}</p>}{result&&<><p lang="th" className="explanation" role="status">{result.text}</p><small>{result.source==='template'?'Internal template':'AI explanation with verified calculated values'}</small></>}</div>;
};
export const GpaxView=({api,initialEnrollmentId})=>{
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
      if(active){if(saved)setProfile({...saved,currentGpa:saved.currentGpa??'',creditsCounted:saved.creditsCounted??''});setCourses(all);setSelected(all.some(c=>c.id===initialEnrollmentId)?initialEnrollmentId:all[0]?.id||'');}
    })().catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    return()=>{active=false;};
  },[api]);
  const clear=()=>{setResults(null);setComparison(null);setScenarios(null);};
  return <><p>Compare your chosen grade scenarios. These are estimates, not predicted grades or official results.</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form className="card" onSubmit={e=>{e.preventDefault();work(async()=>{
      const saved=await api('/me/profile',{method:'PUT',body:JSON.stringify(Object.fromEntries(Object.entries(profile).map(([k,v])=>[k,(k==='currentGpa'||k==='creditsCounted')&&v===''?null:Number(v)])))});
      setProfile(saved);clear();setNotice('Academic profile saved');
    });}}><h3>Academic Profile</h3><p>Use your cumulative GPA and the credits counted in that GPA, which may differ from passed credits.</p>
      {[['currentGpa','Current Cumulative GPA (GPAX)',0,4,'any'],['creditsCounted','GPA-counted Credits',0,2147483647,1],['academicYear','Academic Year (Gregorian)',1,9999,1],['semester','Semester',1,3,1]].map(([key,label,min,max,step])=><label key={key}>{label}<input required type="number" min={min} max={max} step={step} disabled={busy} value={profile[key]??''} onChange={e=>{clear();setProfile(p=>({...p,[key]:e.target.value}));}}/></label>)}<button disabled={busy}>Save academic profile</button>
    </form>
    <form onSubmit={e=>{e.preventDefault();work(async()=>{
      const base=courses.map(c=>({enrollmentId:c.id,outcome:outcomes[c.id]==='W'?'withdraw':'grade',...(outcomes[c.id]==='W'?{}:{grade:outcomes[c.id]})}));
      if(base.find(o=>o.enrollmentId===selected)?.outcome!=='grade')throw Error('Choose an assumed grade for the course you want to compare.');
      const cases=[{label:'Stay',outcomes:base},{label:'Withdraw',outcomes:base.map(o=>o.enrollmentId===selected?{enrollmentId:o.enrollmentId,outcome:'withdraw'}:o)}];
      const result=await api('/gpax/scenarios',{method:'POST',body:JSON.stringify({scenarios:cases})});setResults(result.results);setComparison(result.comparison);setScenarios(cases);
    });}}><h3>Assumed Grades</h3>
      {!courses.length&&<p>Add a course before comparing scenarios.</p>}
      {courses.map(c=><div className="card" key={c.id}><h3>{c.section.courseCode} · {c.section.courseName}</h3><p>{c.section.credits} credits. Choose an assumed grade yourself. RordMai does not predict class-based grades.</p>
        <label>Assumed Outcome<select required disabled={busy} value={outcomes[c.id]||''} onChange={e=>{clear();setOutcomes(old=>({...old,[c.id]:e.target.value}));}}><option value="" disabled>Choose a grade or W</option>{[...grades,'W'].map(g=><option key={g}>{g}</option>)}</select></label>
        <label>Previous Grade Point for Repeated Course<select disabled={busy} value={c.repeatDraft} onChange={e=>{clear();setCourses(old=>old.map(item=>item.id===c.id?{...item,repeatDraft:e.target.value}:item));}}><option value="none">Not a repeated course</option>{[0,1,1.5,2,2.5,3,3.5,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <button type="button" className="secondary" disabled={busy} onClick={()=>work(async()=>{
          const saved=await api('/enrollments/'+c.id,{method:'PATCH',body:JSON.stringify({repeat:c.repeatDraft==='none'?null:{previousGradePoint:Number(c.repeatDraft)}})});
          clear();setCourses(old=>old.map(item=>item.id===c.id?{...item,repeat:saved.repeat}:item));setNotice('Repeat information saved. Repeated-course GPAX remains blocked until the official rule is verified.');
        })}>Save repeat information</button></div>)}
      {courses.length>0&&<><label>Course to Compare<select required disabled={busy} value={selected} onChange={e=>{clear();setSelected(e.target.value);}}>{courses.map(c=><option key={c.id} value={c.id}>{c.section.courseCode} · Section {c.section.sectionNumber}</option>)}</select></label><button disabled={busy}>Compare staying and withdrawal</button></>}
    </form>
    {results&&<><div className="columns">{results.map((r,i)=><div className="card" key={r.label}><h3>{i===0?'Stay':'Withdraw'}</h3><strong>GPAX {format(r.gpax)}</strong><p>GPA-counted credits: {r.creditsCounted}</p></div>)}</div>
      <p role="status">GPAX difference (withdraw minus stay): {format(comparison?.delta)}</p>
      {results.every(r=>r.gpax!==null)&&<figure className="card" aria-label="GPAX comparison chart"><figcaption>Estimated GPAX: staying versus withdrawal</figcaption><div style={{width:'100%',height:240,minWidth:0}}>
        <ResponsiveContainer width="100%" height="100%"><BarChart accessibilityLayer data={results.map((r,i)=>({name:i===0?'Stay':'Withdraw',gpax:r.gpax}))}><XAxis dataKey="name"/><YAxis domain={[0,4]}/><Tooltip formatter={value=>[format(value),'GPAX']}/><Bar dataKey="gpax" fill="var(--chart)" isAnimationActive={false}/></BarChart></ResponsiveContainer>
      </div></figure>}
      <p className="message info">Estimates use your self-reported baseline and assumed grades. They are not advice to withdraw. W contributes no GPA credits or quality points. Consider prerequisites, availability and costs with your adviser.</p>
      <aside className="card" aria-labelledby="withdrawal-considerations"><h3 id="withdrawal-considerations">Before You Withdraw</h3><ul>
        <li>Credits: withdrawal earns no course credits and may affect your graduation plan.</li>
        <li>Prerequisites: check whether this course is required for later courses.</li>
        <li>Availability: check when the course will next run and whether seats will be available.</li>
        <li>Costs: check university refund rules and the cost of enrolling again.</li>
      </ul><p>This is an estimate, not advice to withdraw. Consult your academic adviser.</p></aside>
      <Explanation key={JSON.stringify(scenarios)} api={api} enrollmentId={selected} kind="withdrawal" scenarios={scenarios}/></>}
  </>;
};
export const SyllabusUpload=({api,onConfirm,onStage,onCancel,disabled})=>{
  const [draft,setDraft]=useState(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const total=draft?.components.reduce((sum,c)=>sum+Math.round(Number(c.weightPercent)*100),0);
  const reset=()=>{setDraft(null);setChecked(false);setError('');onStage(false);};
  const change=(i,key,value)=>{setChecked(false);setDraft(d=>({...d,components:d.components.map((c,n)=>n===i?{...c,[key]:value}:c)}));};
  return <div className="syllabus-flow">{!draft?<><span className="feature-icon"><Icon name="scan"/></span><p>Upload a syllabus screenshot or PDF to extract assessment names and weights.</p><div className="upload-zone"><span className="feature-icon"><Icon name="scan"/></span><h3>Upload Syllabus</h3><p>Choose a screenshot or file (PDF, PNG, JPG; PDF up to 8 pages)</p><label className="file-label">Syllabus File<input type="file" accept="application/pdf,image/png,image/jpeg" disabled={disabled||busy} onChange={async e=>{
    const file=e.target.files?.[0];e.target.value='';reset();if(!file)return;
    if(!['application/pdf','image/png','image/jpeg'].includes(file.type)){setError('Choose a PDF, PNG or JPEG file.');return;}
    if(file.size>5*1024*1024){setError('Maximum file size: 5 MiB');return;}
    const body=new FormData();body.append('image',file);setBusy(true);
    try{const result=await api('/ocr/syllabus',{method:'POST',body});setDraft(result);onStage(true);}catch(e){setError(e.message);}finally{setBusy(false);}
  }}/></label></div><p className="message warning"><strong>Verification Step Required</strong><br/>Uploading does not save or create a section. Check and edit every extracted value on the next screen.</p><p className="message info"><strong>Internal Processing Privacy</strong><br/>Syllabus images stay within RordMai and are not sent to the external AI explanation service.</p><button type="button" className="secondary" disabled={busy} onClick={onCancel}>Enter Manually Instead</button></>:<>
    <p>Check the extracted values below. Tap any field to make corrections.</p><p className="message info">Nothing will be saved until final section creation.</p><ul>{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
    {draft.components.map((c,i)=><fieldset className="card extracted-card" key={i}><legend>Extracted Assessment {i+1}</legend><label>Assessment Name<input value={c.name} maxLength="100" onChange={e=>change(i,'name',e.target.value)}/></label><div className="columns"><label>Max Score<input type="number" min="0.01" step="any" value={c.maximumScore} onChange={e=>change(i,'maximumScore',e.target.value)}/></label><label>Weight (%)<input type="number" min="0.01" max="100" step="0.01" value={c.weightPercent} onChange={e=>change(i,'weightPercent',e.target.value)}/></label></div><label>Input Type<select value={c.inputType} onChange={e=>change(i,'inputType',e.target.value)}><option value="marks">Score</option><option value="attendance">Attendance</option></select></label></fieldset>)}
    <div className="weight-total success" role="status">Total Extracted Weight: {format(total/100)}%</div><label className="check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I have checked all extracted values against the syllabus</label>
    <button type="button" disabled={disabled||!checked||total!==10000||draft.components.some(c=>!c.name.trim()||!Number.isFinite(Number(c.maximumScore))||Number(c.maximumScore)<=0||!Number.isFinite(Number(c.weightPercent))||Number(c.weightPercent)<=0||!['marks','attendance'].includes(c.inputType))} onClick={()=>onConfirm(draft.components.map(c=>({...c,weightPercent:Number(c.weightPercent),maximumScore:Number(c.maximumScore)})))}>Confirm & Continue <Icon name="arrow"/></button><button type="button" className="secondary" onClick={reset}>Upload Another File</button><button type="button" className="text-button" onClick={onCancel}>Discard syllabus draft</button>
  </>}{busy&&<p role="status">Reading syllabus…</p>}{error&&<p role="alert" className="message error">{error}</p>}</div>;
};
