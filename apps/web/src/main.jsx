import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import liff from './line-client.js';
import './style.css';
import rordmaiLogo from './assets/rordmai-logo.png';
import { CourseWorkspace } from './CourseWorkspace.jsx';

const App = () => {
  const [consent, setConsent] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [explanationStep, setExplanationStep] = useState(false);
  const callApi = useCallback(async (route, options = {}) => {
    const token = liff.getIDToken();
    if (!token) throw new Error('เซสชัน LINE หมดอายุ กรุณาเปิดแอปใหม่เพื่อเข้าสู่ระบบ');
    const response = await fetch('/api/v1' + route, {
      ...options, headers: { Authorization: 'Bearer ' + token,
        ...(options.body instanceof FormData ? {} : {'Content-Type':'application/json'}) },
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.details?.[0]?.message || result.error?.message || 'ดำเนินการไม่สำเร็จ กรุณาลองใหม่'),{status:response.status,code:result.error?.code});
    return result.data;
  }, []);
  useEffect(() => {
    let active = true;
    const initialise = async () => {
      const response = await fetch('/api/config');
      const result = await response.json();
      if (!result.data?.liffId) throw new Error('ยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE');
      await liff.init({ liffId: result.data.liffId });
      if (!liff.isLoggedIn()) { liff.login(); return; }
      const value = await callApi('/consents');
      if (active) { setConsent(value); setReady(true); }
    };
    initialise().catch((e) => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [callApi]);
  const act = async (work) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const privacy = <>
    <div className="card"><p className="success">คุณยินยอมให้จัดเก็บข้อมูลแล้ว</p>
      <p>ระบบจัดเก็บรหัส LINE รายวิชาที่เข้าร่วม และข้อมูลการเรียนบนบริการโฮสต์ฟรีนอกประเทศไทย ซึ่งอาจพักการทำงานเมื่อไม่มีผู้ใช้</p>
      <small>นโยบายการจัดเก็บข้อมูล: {consent?.policyVersion}</small></div>
    <div className="card"><h3>ถอนความยินยอมและลบข้อมูลของฉัน</h3>
      <p>การลบจะนำข้อมูลการเรียนและสถานะสนทนาส่วนตัวออก โครงสร้างรายวิชาที่เพื่อนยังใช้จะคงอยู่โดยลบชื่อผู้สร้าง การดำเนินการนี้ย้อนกลับไม่ได้</p>
      <label className="check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />ฉันยืนยันการลบข้อมูลที่บันทึกไว้</label>
      <button className="danger" disabled={!confirmed || busy} onClick={() => act(async () => {
        await callApi('/me/data', { method: 'DELETE', body: JSON.stringify({ confirmDeletion: true }) });
        // Clear private views immediately, even if fetching the new policy fails.
        setConsent(old => ({ ...old, storage: false }));
        setConfirmed(false); setAccepted(false); setExplanationStep(false);
        setConsent(await callApi('/consents')); setNotice('ลบข้อมูลและถอนความยินยอมให้จัดเก็บข้อมูลแล้ว');
      })}>ลบข้อมูลของฉัน</button></div>
  </>;
  const explanationConsent=<div className="card"><h3>คำอธิบายด้วย AI (ไม่บังคับ)</h3><p>หากยินยอม ระบบจะส่งเฉพาะค่าที่คำนวณแล้วโดยไม่ระบุชื่อให้ Google Gemini ซึ่งอาจประมวลผลนอกประเทศไทยและมีมาตรฐานคุ้มครองต่างกัน โดยไม่ส่งชื่อ รหัส LINE รหัสวิชา หรือคะแนนรายชิ้นงาน หากไม่ยินยอมยังใช้คำอธิบายภาษาไทยจากแม่แบบภายในได้ครบ</p>
    <label className="check"><input type="checkbox" checked={consent?.crossBorderExplanation===true} disabled={busy} onChange={e=>{
      const enabled=e.target.checked,previous=consent.crossBorderExplanation;
      setConsent(old=>({...old,crossBorderExplanation:enabled}));
      act(async()=>{try{setConsent(await callApi('/consents/cross-border-explanation',{method:'PUT',body:JSON.stringify({crossBorderExplanation:enabled,policyVersion:consent.policyVersion})}));}
        catch(error){setConsent(old=>({...old,crossBorderExplanation:previous}));throw error;}});
    }}/>ฉันยินยอมให้ส่งค่าที่คำนวณแล้วไปประมวลผลภายนอกเพื่อสร้างคำอธิบาย</label></div>;
  return <main className="app-shell">
    <header className="brand"><svg className="brand-mark" viewBox="381 189 635 635" width="40" height="40" aria-hidden="true"><image href={rordmaiLogo} width="1359" height="1157" /></svg><div><h1>Rord-Mai</h1><small>ผู้ช่วยติดตามผลการเรียน</small></div><span className="liff-label">แอปใน LINE</span></header>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!ready && !error && <p role="status">กำลังเชื่อมต่อ LINE อย่างปลอดภัย…</p>}
    {ready && (!consent.storage ? <section className="screen" aria-labelledby="privacy"><p className="eyebrow">ยินดีต้อนรับสู่รอดมั้ย</p><h2 id="privacy">ข้อมูลของคุณ คุณเป็นผู้เลือก</h2>
      <p>เข้าใจคะแนนของคุณ<br />วางแผนการเรียนขั้นต่อไป</p>
      <div className="card"><h3>ความยินยอมให้จัดเก็บข้อมูลการเรียน</h3>
      <p>ระบบจะจัดเก็บรหัส LINE รายวิชาที่เข้าร่วม และข้อมูลการเรียนเมื่อคุณยินยอมเท่านั้น
        การเข้าสู่ระบบเพียงอย่างเดียวจะไม่สร้างระเบียนนักศึกษา</p>
      <p>สำหรับการสาธิตนี้ กรุณาใช้บัญชีทดสอบและข้อมูลการเรียนสมมติ ข้อมูลอยู่บนบริการโฮสต์ฟรีนอกประเทศไทย ซึ่งอาจพักการทำงานเมื่อไม่มีผู้ใช้</p>
      <small>นโยบายการจัดเก็บข้อมูล: {consent.policyVersion}</small>
        <label className="check"><input type="checkbox" checked={accepted} disabled={busy} onChange={(e) => setAccepted(e.target.checked)} />
          ฉันยินยอมให้จัดเก็บข้อมูลการเรียนสมมติสำหรับการสาธิตบนโฮสต์นอกประเทศไทย</label>
        <button disabled={!accepted || busy} onClick={() => act(async () => {
          const value = await callApi('/consents/storage', { method: 'PUT', body: JSON.stringify({
            storage: true, policyVersion: consent.policyVersion,
          }) });
          setConsent(value); setExplanationStep(true); setNotice('');
        })}>ยินยอมและดำเนินการต่อ</button>
        <button className="secondary" disabled={busy} onClick={() => { setAccepted(false); setNotice('ไม่ยินยอม ระบบไม่ได้สร้างระเบียนนักศึกษาจากการเลือกนี้'); }}>ไม่ยินยอม</button>
      </div>
    </section> : explanationStep ? <section className="screen" aria-labelledby="explanation-choice"><h2 id="explanation-choice">คำอธิบายด้วย AI (ไม่บังคับ)</h2>
      <p>ระบบสามารถส่งค่าที่คำนวณแล้วโดยไม่ระบุชื่อไปยัง Google Gemini ซึ่งอาจประมวลผลนอกประเทศไทย โดยไม่ส่งชื่อ รหัส LINE รหัสวิชา หรือคะแนนรายชิ้นงาน</p>
      <p>หากไม่ยินยอม คุณยังใช้ทุกฟังก์ชันหลักและคำอธิบายภาษาไทยจากแม่แบบภายในได้ และเปลี่ยนใจได้ที่หน้าความเป็นส่วนตัว</p>
      {[true,false].map(enabled=><button key={String(enabled)} className={enabled?'':'secondary'} disabled={busy} onClick={()=>act(async()=>{
        setConsent(await callApi('/consents/cross-border-explanation',{method:'PUT',body:JSON.stringify({crossBorderExplanation:enabled,policyVersion:consent.policyVersion})}));
        setExplanationStep(false);
      })}>{enabled?'ยินยอมใช้ AI อธิบาย':'ใช้ต่อโดยไม่ใช้ AI'}</button>)}
    </section> : <CourseWorkspace api={callApi} privacy={<>{privacy}{explanationConsent}</>} privacyBusy={busy} />)}
    <footer>การสาธิต · ใช้ข้อมูลการเรียนสมมติ</footer>
  </main>;
};
createRoot(document.getElementById('root')).render(<App />);
