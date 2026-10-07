import React,{useEffect,useState} from 'react';
const grades=['A','B+','B','C+','C','D+','D','F'];
const format=n=>n==null?'Unavailable':Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
export const Explanation=({api,enrollmentId,kind='summary',scenarios})=>{
  const [result,setResult]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="card"><button className="secondary" disabled={busy} onClick={async()=>{
    setBusy(true);setError('');setResult(null);
    try{setResult(await api('/enrollments/'+enrollmentId+'/explanation',{method:'POST',body:JSON.stringify({kind,...(scenarios?{scenarios}:{})})}));}
    catch(e){setError(e.message);}finally{setBusy(false);}
  }}>Explain in Thai</button>{error&&<p role="alert">{error}</p>}{result&&<><p lang="th" className="explanation" role="status">{result.text}</p><small>{result.source==='template'?'Local template':'AI wording with verified calculated values'}</small></>}</div>;
};
export const GpaxView=({api})=>{
  const [profile,setProfile]=useState({currentGpa:'',creditsCounted:'',academicYear:new Date().getFullYear(),semester:1});
  const [courses,setCourses]=useState([]),[selected,setSelected]=useState(''),[outcomes,setOutcomes]=useState({}),[results,setResults]=useState(null),[scenarios,setScenarios]=useState(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
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
  const clear=()=>{setResults(null);setScenarios(null);};
  return <><p>Compare explicit grade assumptions. These are estimates, not predicted or official grades.</p>
    {error&&<p className="error" role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    <form className="card" onSubmit={e=>{e.preventDefault();work(async()=>{
      const saved=await api('/me/profile',{method:'PUT',body:JSON.stringify(Object.fromEntries(Object.entries(profile).map(([k,v])=>[k,Number(v)])))});
      setProfile(saved);clear();setNotice('Cumulative profile saved.');
    });}}><h3>Cumulative profile</h3><p>Use the cumulative GPA and credits already counted in that GPA. Passed credits alone can be a different number.</p>
      {[['currentGpa','Cumulative GPA',0,4,'any'],['creditsCounted','Credits counted in GPA',0,2147483647,1],['academicYear','Academic year',1,9999,1],['semester','Semester',1,3,1]].map(([key,label,min,max,step])=><label key={key}>{label}<input required type="number" min={min} max={max} step={step} disabled={busy} value={profile[key]} onChange={e=>{clear();setProfile(p=>({...p,[key]:e.target.value}));}}/></label>)}<button disabled={busy}>Save cumulative profile</button>
    </form>
    <form onSubmit={e=>{e.preventDefault();work(async()=>{
      const base=courses.map(c=>({enrollmentId:c.id,outcome:outcomes[c.id]==='W'?'withdraw':'grade',...(outcomes[c.id]==='W'?{}:{grade:outcomes[c.id]})}));
      if(base.find(o=>o.enrollmentId===selected)?.outcome!=='grade')throw Error('Choose a grade for the course being compared.');
      const cases=[{label:'Stay',outcomes:base},{label:'Withdraw',outcomes:base.map(o=>o.enrollmentId===selected?{enrollmentId:o.enrollmentId,outcome:'withdraw'}:o)}];
      const result=await api('/gpax/scenarios',{method:'POST',body:JSON.stringify({scenarios:cases})});setResults(result.results);setScenarios(cases);
    });}}><h3>Grade assumptions</h3>
      {!courses.length&&<p>Add a course before comparing scenarios.</p>}
      {courses.map(c=><div className="card" key={c.id}><h3>{c.section.courseCode} · {c.section.courseName}</h3><p>{c.section.credits} credits. Enter an assumption even for norm grading; the app does not predict it.</p>
        <label>Assumed outcome<select required disabled={busy} value={outcomes[c.id]||''} onChange={e=>{clear();setOutcomes(old=>({...old,[c.id]:e.target.value}));}}><option value="" disabled>Choose a grade or W</option>{[...grades,'W'].map(g=><option key={g}>{g}</option>)}</select></label>
        <label>Previous grade point for a repeated course<select disabled={busy} value={c.repeatDraft} onChange={e=>{clear();setCourses(old=>old.map(item=>item.id===c.id?{...item,repeatDraft:e.target.value}:item));}}><option value="none">Not a repeated course</option>{[0,1,1.5,2,2.5,3,3.5,4].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <button type="button" className="secondary" disabled={busy} onClick={()=>work(async()=>{
          const saved=await api('/enrollments/'+c.id,{method:'PATCH',body:JSON.stringify({repeat:c.repeatDraft==='none'?null:{previousGradePoint:Number(c.repeatDraft)}})});
          clear();setCourses(old=>old.map(item=>item.id===c.id?{...item,repeat:saved.repeat}:item));setNotice('Repeat metadata saved. Repeated-course calculations remain unavailable until the official rule is verified.');
        })}>Save repeat information</button></div>)}
      {courses.length>0&&<><label>Course to compare<select required disabled={busy} value={selected} onChange={e=>{clear();setSelected(e.target.value);}}>{courses.map(c=><option key={c.id} value={c.id}>{c.section.courseCode} · Section {c.section.sectionNumber}</option>)}</select></label><button disabled={busy}>Compare stay and withdraw</button></>}
    </form>
    {results&&<><div className="columns">{results.map(r=><div className="card" key={r.label}><h3>{r.label}</h3><strong>GPAX {format(r.gpax)}</strong><p>{r.creditsCounted} counted credits</p></div>)}</div><p lang="th" className="message">{results[0].disclaimer}</p><ul lang="th">{results[0].assumptions.map(s=><li key={s}>{s}</li>)}</ul><Explanation key={JSON.stringify(scenarios)} api={api} enrollmentId={selected} kind="withdrawal" scenarios={scenarios}/></>}
  </>;
};
export const SyllabusUpload=({api,onConfirm,disabled})=>{
  const [draft,setDraft]=useState(null),[checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const total=draft?.components.reduce((sum,c)=>sum+Math.round(Number(c.weightPercent)*100),0);
  const change=(index,key,value)=>{setChecked(false);setDraft(old=>({...old,components:old.components.map((c,i)=>i===index?{...c,[key]:value}:c)}));};
  return <div className="card"><h3>Read a syllabus image</h3><p>Optional PNG/JPG upload. PDF is not supported. Manual entry below remains available.</p>
    <label>Syllabus image<input type="file" accept="image/png,image/jpeg" disabled={disabled||busy} onChange={async e=>{
      const file=e.target.files?.[0];e.target.value='';setDraft(null);setChecked(false);setError('');if(!file)return;
      if(!['image/png','image/jpeg'].includes(file.type)){setError('Choose a PNG or JPEG image. PDF is not supported.');return;}
      if(file.size>5*1024*1024){setError('Maximum upload size is 5 MiB.');return;}
      const body=new FormData();body.append('image',file);setBusy(true);
      try{setDraft(await api('/ocr/syllabus',{method:'POST',body}));}catch(err){setError(err.message);}finally{setBusy(false);}
    }}/></label>{busy&&<p role="status">Reading the image…</p>}{error&&<p role="alert" className="error">{error}</p>}
    {draft&&<><ul lang="th">{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>
      {draft.components.map((c,i)=><fieldset className="card" key={i}><legend>Extracted assessment {i+1}</legend><label>Name<input value={c.name} maxLength="100" onChange={e=>change(i,'name',e.target.value)}/></label><label>Weight (%)<input type="number" min="0.01" max="100" step="0.01" value={c.weightPercent} onChange={e=>change(i,'weightPercent',e.target.value)}/></label><label>Maximum marks<input type="number" min="0.01" step="any" value={c.maximumScore} onChange={e=>change(i,'maximumScore',e.target.value)}/></label><label>Input type<select value={c.inputType} onChange={e=>change(i,'inputType',e.target.value)}><option value="marks">Marks</option><option value="attendance">Attendance</option></select></label></fieldset>)}
      <p role="status">Extracted weight total: {format(total/100)}%</p><label className="check"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/>I checked every extracted value against the syllabus.</label>
      <button type="button" disabled={disabled||!checked||total!==10000||draft.components.some(c=>!c.name.trim()||!Number.isFinite(Number(c.maximumScore))||Number(c.maximumScore)<=0||Number(c.weightPercent)<=0)} onClick={()=>{onConfirm(draft.components.map(c=>({...c,weightPercent:Number(c.weightPercent),maximumScore:Number(c.maximumScore)})));setDraft(null);setChecked(false);}}>Use confirmed draft</button><button type="button" className="secondary" onClick={()=>{setDraft(null);setChecked(false);}}>Discard OCR draft</button><small>Nothing is saved until you finish creating the section.</small>
    </>}
  </div>;
};
