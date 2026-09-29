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
  const callApi = useCallback(async (route, options = {}) => {
    const token = liff.getIDToken();
    if (!token) throw new Error('Your LINE session has expired. Reopen the app to sign in.');
    const response = await fetch('/api/v1' + route, {
      ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Request failed. Please retry.');
    return result.data;
  }, []);
  useEffect(() => {
    let active = true;
    const initialise = async () => {
      const response = await fetch('/api/config');
      const result = await response.json();
      if (!result.data?.liffId) throw new Error('LINE connection is not configured yet.');
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
    <div className="card"><p className="success">Storage consent is active.</p>
      <p>We save your LINE identifier, course memberships and academic entries. Data is stored on free overseas hosting. The service may pause when idle.</p>
      <small>Storage policy: {consent?.policyVersion}</small></div>
    <div className="card"><h3>Withdraw consent and delete my data</h3>
      <p>This removes your saved academic data and private chat state. Shared course structures used by classmates remain, with your creator attribution removed. This cannot be undone.</p>
      <label className="check"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(e) => setConfirmed(e.target.checked)} />I confirm deletion of my saved data.</label>
      <button className="danger" disabled={!confirmed || busy} onClick={() => act(async () => {
        await callApi('/me/data', { method: 'DELETE', body: JSON.stringify({ confirmDeletion: true }) });
        // Clear private views immediately, even if fetching the new policy fails.
        setConsent(old => ({ ...old, storage: false }));
        setConfirmed(false); setAccepted(false);
        setConsent(await callApi('/consents')); setNotice('Your data was deleted and storage consent withdrawn.');
      })}>Delete my data</button></div>
  </>;
  return <main className="app-shell">
    <header className="brand"><svg className="brand-mark" viewBox="381 189 635 635" width="40" height="40" aria-hidden="true"><image href={rordmaiLogo} width="1359" height="1157" /></svg><div><h1>Rord-Mai</h1><small>Your academic companion</small></div><span className="liff-label">LINE app</span></header>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!ready && !error && <p role="status">Connecting securely to LINE…</p>}
    {ready && (!consent.storage ? <section className="screen" aria-labelledby="privacy"><p className="eyebrow">WELCOME TO RORD-MAI</p><h2 id="privacy">Your data, your choice</h2>
      <p>Understand your scores.<br />Plan your next step.</p>
      <div className="card"><h3>Academic data permission</h3>
      <p>We save your LINE identifier, course memberships and academic entries only after you agree.
        Signing in alone does not create a student record.</p>
      <p>Use fictional academic data and test accounts for this progress demo. Data is stored on free overseas hosting. The service may pause when idle.</p>
      <small>Storage policy: {consent.policyVersion}</small>
        <label className="check"><input type="checkbox" checked={accepted} disabled={busy} onChange={(e) => setAccepted(e.target.checked)} />
          I agree to store my fictional academic data for this overseas hosted demo.</label>
        <button disabled={!accepted || busy} onClick={() => act(async () => {
          const value = await callApi('/consents', { method: 'PUT', body: JSON.stringify({
            storage: true, crossBorderExplanation: false, policyVersion: consent.policyVersion,
          }) });
          setConsent(value); setNotice('');
        })}>Agree and continue</button>
        <button className="secondary" disabled={busy} onClick={() => { setAccepted(false); setNotice('Declined. No student record was created by this choice.'); }}>Decline</button>
      </div>
    </section> : <CourseWorkspace api={callApi} privacy={privacy} privacyBusy={busy} />)}
    <footer>Progress demo · Fictional academic data</footer>
  </main>;
};
createRoot(document.getElementById('root')).render(<App />);
