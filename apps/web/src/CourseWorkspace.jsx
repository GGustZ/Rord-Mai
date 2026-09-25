import React, { useState } from 'react';

const thresholds = { A:80,'B+':75,B:70,'C+':65,C:60,'D+':55,D:50 };
const presets = {
  exams: [{name:'Midterm',weightPercent:40,maximumScore:100},{name:'Final',weightPercent:60,maximumScore:100}],
  mixed: [{name:'Attendance',weightPercent:10,maximumScore:20},{name:'Assignments',weightPercent:20,maximumScore:50},{name:'Project',weightPercent:30,maximumScore:100},{name:'Final',weightPercent:40,maximumScore:100}],
  norm: [{name:'Coursework',weightPercent:30,maximumScore:60},{name:'Examination',weightPercent:70,maximumScore:100}],
};
const initial = () => ({courseCode:'DEMO101',courseName:'Fictional mathematics',sectionNumber:'1',
  academicYear:2026,semester:1,credits:3,gradingMode:'criterion',withdrawalDeadline:'2026-10-15',
  gradeThresholds:{...thresholds},components:presets.exams.map(c=>({...c}))});
const format = number => number === null ? 'Unavailable' : Number(number).toLocaleString(undefined,{maximumFractionDigits:2});

const EntryForm = ({component,score,attendance,busy,onSave,onDelete}) => {
  const [kind,setKind]=useState(attendance?'attendance':'scores');
  const [raw,setRaw]=useState(score?.score??'');
  const [attended,setAttended]=useState(attendance?.attended??'');
  const [total,setTotal]=useState(attendance?.totalSessions??'');
  return <form className="entry" onSubmit={event=>{
    event.preventDefault();
    onSave(kind,kind==='scores'?{score:Number(raw)}:{attended:Number(attended),totalSessions:Number(total)});
  }}>
    <h4>{component.name} <span>{component.weightPercent}% weight</span></h4>
    <p>Maximum: {component.maximumScore} marks. {score ? 'Recorded: '+score.score : attendance ? 'Attendance: '+attendance.attended+'/'+attendance.totalSessions : 'Not recorded'}</p>
    <label>Entry method<select value={kind} disabled={busy||Boolean(score)||Boolean(attendance)} onChange={e=>setKind(e.target.value)}>
      <option value="scores">Raw marks</option><option value="attendance">Attendance</option>
    </select></label>
    {kind==='scores'?<label>{component.name} score<input type="number" required min="0" max={component.maximumScore} step="any" value={raw} onChange={e=>setRaw(e.target.value)}/></label>:
      <div className="columns"><label>Attended<input type="number" required min="0" step="1" value={attended} onChange={e=>setAttended(e.target.value)}/></label>
        <label>Total sessions<input type="number" required min="1" step="1" value={total} onChange={e=>setTotal(e.target.value)}/></label></div>}
    <button disabled={busy}>Save {component.name}</button>
    {(score||attendance)&&<button type="button" className="secondary" disabled={busy} onClick={()=>onDelete(attendance?'attendance':'scores')}>Clear {component.name} entry</button>}
    {(score||attendance)&&<small>Clear the existing entry before switching method.</small>}
  </form>;
};

export const CourseWorkspace = ({api}) => {
  const [page,setPage]=useState(null);
  const [names,setNames]=useState({});
  const [detail,setDetail]=useState(null);
  const [summary,setSummary]=useState(null);
  const [target,setTarget]=useState(null);
  const [targetGrade,setTargetGrade]=useState('A');
  const [draft,setDraft]=useState(initial);
  const [code,setCode]=useState('');
  const [showCreate,setShowCreate]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [weights,setWeights]=useState([]);
  const [confirmWeights,setConfirmWeights]=useState(false);
  const [editingWeights,setEditingWeights]=useState(false);
  const work=async fn=>{
    setBusy(true);setError('');
    try{await fn();}catch(e){setError(e.message);}finally{setBusy(false);}
  };
  const loadPage=async(cursor=null)=>{
    const result=await api('/enrollments'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
    const sections=await Promise.all(result.items.map(item=>api('/sections/'+item.sectionId)));
    setNames(old=>({...old,...Object.fromEntries(sections.map(s=>[s.id,s.courseName+' · '+s.sectionNumber]))}));
    setPage(old=>cursor&&old?{...result,items:[...old.items,...result.items]}:result);
  };
  const loadDetail=async id=>{
    // Both responses identify their revision. Never display a mixed-revision view.
    for(let attempt=0;attempt<3;attempt++){
      const next=await api('/enrollments/'+id);
      const calculated=await api('/enrollments/'+id+'/summary');
      if(next.section.structureRevision!==calculated.structureRevision)continue;
      if(detail&&detail.section.id===next.section.id&&detail.section.structureRevision!==next.section.structureRevision){
        setNotice('The creator changed grading weights. Results have been recalculated; your raw scores are unchanged.');
      }
      setDetail(next);setSummary(calculated);setTarget(null);
      setTargetGrade(next.enrollment.targetGrade||'A');
      setWeights(next.section.components.map(c=>({id:c.id,weightPercent:c.weightPercent})));
      setConfirmWeights(false);setEditingWeights(false);
      return;
    }
    throw Error('The course is changing. Refresh and try again.');
  };
  const setField=(key,value)=>setDraft(old=>({...old,[key]:value}));
  const choosePreset=key=>setDraft({...initial(),courseName:key==='norm'?'Fictional norm course':key==='mixed'?'Fictional design studio':'Fictional mathematics',
    gradingMode:key==='norm'?'norm':'criterion',gradeThresholds:key==='norm'?null:{...thresholds},components:presets[key].map(c=>({...c}))});
  return <div className="workspace">
    <h3>My courses</h3>
    {error&&<p role="alert" className="error">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <button disabled={busy} onClick={()=>work(()=>loadPage())}>View my courses</button>
    {page&&<div>{page.items.length?<ul className="course-list">{page.items.map(item=><li key={item.id}>
      <button className="secondary" disabled={busy} onClick={()=>work(()=>loadDetail(item.id))}>{names[item.sectionId]||'Open course'}</button>
    </li>)}</ul>:<p>No courses joined yet. Create a section or enter a classmate's join code.</p>}
    {page.nextCursor&&<button disabled={busy} onClick={()=>work(()=>loadPage(page.nextCursor))}>Load more courses</button>}</div>}
    <form onSubmit={e=>{e.preventDefault();work(async()=>{
      const joined=await api('/sections/join',{method:'POST',body:JSON.stringify({joinCode:code})});
      await loadPage();await loadDetail(joined.id);setCode('');setNotice('Section joined.');
    });}}>
      <label>Section join code<input required maxLength="6" value={code} onChange={e=>setCode(e.target.value.toUpperCase())}/></label>
      <button disabled={busy}>Join section</button>
    </form>
    <button className="secondary" disabled={busy} onClick={()=>setShowCreate(!showCreate)}>{showCreate?'Close creation form':'Create a section'}</button>
    {showCreate&&<form onSubmit={e=>{e.preventDefault();work(async()=>{
      const payload={...draft,academicYear:Number(draft.academicYear),semester:Number(draft.semester),credits:Number(draft.credits),
        components:draft.components.map(c=>({...c,weightPercent:Number(c.weightPercent),maximumScore:Number(c.maximumScore)})),
        gradeThresholds:draft.gradingMode==='norm'?null:Object.fromEntries(Object.entries(draft.gradeThresholds).map(([k,v])=>[k,Number(v)]))};
      const saved=await api('/sections',{method:'POST',body:JSON.stringify(payload)});
      setShowCreate(false);await loadPage();await loadDetail(saved.enrollment.id);
      setNotice('Section created. Share its join code with your classmates.');
    });}}>
      <h3>New section</h3>
      <p>Start with fictional demo data, then enter the rules from the teacher's syllabus. Review every weight and threshold.</p>
      <label>Load a demo structure<select defaultValue="exams" onChange={e=>choosePreset(e.target.value)}>
        <option value="exams">Two exams, 40/60</option><option value="mixed">Four assessments, 10/20/30/40</option><option value="norm">Norm grading, 30/70</option>
      </select></label>
      {['courseCode','courseName','sectionNumber'].map((key,i)=><label key={key}>{['Course code','Course name','Section number'][i]}
        <input required value={draft[key]} onChange={e=>setField(key,e.target.value)}/></label>)}
      <div className="columns">{['academicYear','semester','credits'].map((key,i)=><label key={key}>{['Academic year','Semester','Credits'][i]}
        <input required type="number" min="1" step="1" max={key==='semester'?3:key==='academicYear'?9999:undefined} value={draft[key]} onChange={e=>setField(key,e.target.value)}/></label>)}</div>
      <label>Withdrawal deadline<input required type="date" value={draft.withdrawalDeadline} onChange={e=>setField('withdrawalDeadline',e.target.value)}/></label>
      <label>Grading mode<select value={draft.gradingMode} onChange={e=>setDraft(old=>({...old,gradingMode:e.target.value,gradeThresholds:e.target.value==='norm'?null:{...thresholds}}))}>
        <option value="criterion">Criterion: teacher gives grade thresholds</option><option value="norm">Norm: no fixed grade prediction</option>
      </select></label>
      {draft.gradeThresholds&&<fieldset><legend>Minimum percentage for each grade</legend><div className="columns">
        {Object.entries(draft.gradeThresholds).map(([grade,value])=><label key={grade}>{grade}
          <input type="number" required min="0" max="100" step="any" value={value} onChange={e=>setDraft(old=>({...old,gradeThresholds:{...old.gradeThresholds,[grade]:e.target.value}}))}/></label>)}
      </div></fieldset>}
      <fieldset><legend>Assessment components</legend>
        {draft.components.map((c,index)=><div className="component-draft" key={index}>
          {['name','weightPercent','maximumScore'].map((key,i)=><label key={key}>{['Component name','Weight (%)','Maximum marks'][i]}
            <input required type={key==='name'?'text':'number'} min={key==='name'?undefined:'0.01'} step={key==='weightPercent'?'0.01':'any'} value={c[key]}
              onChange={e=>setDraft(old=>({...old,components:old.components.map((v,n)=>n===index?{...v,[key]:e.target.value}:v)}))}/></label>)}
          <button type="button" className="secondary" disabled={draft.components.length===1} onClick={()=>setDraft(old=>({...old,components:old.components.filter((_,n)=>n!==index)}))}>Remove component {index+1}</button>
        </div>)}
        <p>Total: {format(draft.components.reduce((sum,c)=>sum+Number(c.weightPercent),0))}% (must be 100%)</p>
        <button type="button" className="secondary" disabled={draft.components.length>=30} onClick={()=>setDraft(old=>({...old,components:[...old.components,{name:'',weightPercent:0,maximumScore:100}]}))}>Add component</button>
      </fieldset>
      <button disabled={busy}>Save section</button>
    </form>}
    {detail&&summary&&<article>
      <h3>{detail.section.courseName} · Section {detail.section.sectionNumber}</h3>
      <p>Join code: <strong>{detail.section.joinCode}</strong> · Structure revision {detail.section.structureRevision}</p>
      <button className="secondary" disabled={busy} onClick={()=>work(()=>loadDetail(detail.enrollment.id))}>Refresh course and weights</button>
      <div className="results">
        <p>Current weighted points: <strong>{format(summary.currentWeightedScore)} / 100</strong></p>
        <p>Remaining weight: {format(summary.remainingWeightPercent)}%</p>
        <p>Maximum possible: {format(summary.maximumPossibleScore)} / 100</p>
        {summary.projectedGrade&&<p>Calculated grade: {summary.projectedGrade}</p>}
      </div>
      {detail.section.gradingMode==='norm'?<p>Norm grading: a letter grade cannot be predicted without the class grading decision.</p>:<form onSubmit={e=>{e.preventDefault();work(async()=>{
        await api('/enrollments/'+detail.enrollment.id,{method:'PATCH',body:JSON.stringify({targetGrade})});
        const result=await api('/enrollments/'+detail.enrollment.id+'/target-calculation',{method:'POST',body:JSON.stringify({targetGrade})});
        if(result.structureRevision!==detail.section.structureRevision){await loadDetail(detail.enrollment.id);throw Error('Weights changed. Review the updated results and calculate again.');}
        setTarget(result);
      });}}>
        <label>Target grade<select value={targetGrade} onChange={e=>{setTargetGrade(e.target.value);setTarget(null);}}>
          {Object.keys(thresholds).map(g=><option key={g}>{g}</option>)}</select></label>
        <button disabled={busy}>Save target and calculate</button>
        {target&&<p role="status">{target.reasonCode==='ALREADY_ACHIEVED'?'Target already achieved.':target.reasonCode==='NO_REMAINING_WEIGHT'?'No remaining assessment weight.':
          'Required on remaining assessments: '+format(target.requiredRemainingPercent)+'%.'} {!target.reachable&&'This target is unreachable under the current structure.'}</p>}
      </form>}
      {detail.section.components.map(component=>{
        const score=detail.scores.find(s=>s.componentId===component.id);
        const attendance=detail.attendance.find(s=>s.componentId===component.id);
        return <EntryForm key={component.id+':'+(score?.updatedAt||attendance?.updatedAt||'empty')} component={component} score={score} attendance={attendance} busy={busy}
          onSave={(kind,input)=>work(async()=>{
            await api('/enrollments/'+detail.enrollment.id+'/'+kind+'/'+component.id,{method:'PUT',body:JSON.stringify(input)});
            await loadDetail(detail.enrollment.id);setNotice('Entry saved.');
          })}
          onDelete={kind=>work(async()=>{
            await api('/enrollments/'+detail.enrollment.id+'/'+kind+'/'+component.id,{method:'DELETE',body:'{}'});
            await loadDetail(detail.enrollment.id);setNotice('Entry cleared. It is now unrecorded.');
          })}/>;
      })}
      {detail.section.canEdit&&<>
        <button className="secondary" disabled={busy} onClick={()=>setEditingWeights(!editingWeights)}>Correct shared weights</button>
        {editingWeights&&<form onSubmit={e=>{e.preventDefault();work(async()=>{
          await api('/sections/'+detail.section.id+'/grading-structure',{method:'PATCH',body:JSON.stringify({expectedRevision:detail.section.structureRevision,components:weights.map(w=>({...w,weightPercent:Number(w.weightPercent)}))})});
          await loadDetail(detail.enrollment.id);setNotice('Shared weights corrected. All classmates keep their raw scores.');
        });}}>
          <h4>Review weight corrections</h4>
          <p>This changes everyone's calculated results. Raw scores, maximum marks and component membership remain unchanged.</p>
          {detail.section.components.map((c,i)=><label key={c.id}>{c.name}: currently {c.weightPercent}%
            <input required aria-label={c.name+' corrected weight'} type="number" min="0.01" max="100" step="0.01" value={weights[i]?.weightPercent??''}
              onChange={e=>setWeights(old=>old.map((v,n)=>n===i?{...v,weightPercent:e.target.value}:v))}/></label>)}
          <p>Total: {format(weights.reduce((sum,w)=>sum+Number(w.weightPercent),0))}%</p>
          <label><input type="checkbox" checked={confirmWeights} onChange={e=>setConfirmWeights(e.target.checked)}/>I checked these corrected weights against the teacher's grading structure.</label>
          <button disabled={busy||!confirmWeights}>Save corrected weights</button>
        </form>}
      </>}
    </article>}
  </div>;
};

