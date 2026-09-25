import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import liff from './line-client.js';
import './style.css';
import { CourseWorkspace } from './CourseWorkspace.jsx';

const App = () => {
  const [consent, setConsent] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const callApi = async (route, options = {}) => {
    const token = liff.getIDToken();
    if (!token) throw new Error('Your LINE session has expired. Reopen the app to sign in.');
    const response = await fetch('/api/v1' + route, {
      ...options, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    if (response.status === 204) return null;
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message || 'Request failed. Please retry.');
    return result.data;
  };
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
  }, []);
  const act = async (work) => {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <main>
    <header><p className="eyebrow">YOUR STUDY COMPANION</p><h1>Rord-Mai</h1>
      <p>Understand your scores. Plan your next step.</p></header>
    <aside>Progress demo: use fictional academic data and test accounts. Data is stored on free overseas hosting. The service may pause when idle.</aside>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!ready && !error && <p role="status">Connecting securely to LINE…</p>}
    {ready && <section aria-labelledby="privacy"><h2 id="privacy">Your data, your choice</h2>
      <p>We save your LINE identifier, course memberships and academic entries only after you agree.
        Signing in alone does not create a student record. External AI explanations are disabled.</p>
      <p>Storage policy: {consent.policyVersion}</p>
      {!consent.storage ? <>
        <label><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} />
          I agree to store my fictional academic data for this overseas hosted demo.</label>
        <button disabled={!accepted || busy} onClick={() => act(async () => {
          const value = await callApi('/consents', { method: 'PUT', body: JSON.stringify({
            storage: true, crossBorderExplanation: false, policyVersion: consent.policyVersion,
          }) });
          setConsent(value); setNotice('Storage consent saved.');
        })}>Agree and continue</button>
        <button className="secondary" disabled={busy} onClick={() => { setAccepted(false); setNotice('Declined. No student record was created by this choice.'); }}>Decline</button>
      </> : <>
        <p className="success">Storage consent is active.</p>
        <CourseWorkspace api={callApi} />
        <hr /><h3>Withdraw consent and delete my data</h3>
        <p>This removes your saved academic data and private chat state. Shared course structures used by classmates remain, with your creator attribution removed. This cannot be undone.</p>
        <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I confirm deletion of my saved data.</label>
        <button className="danger" disabled={!confirmed || busy} onClick={() => act(async () => {
          await callApi('/me/data', { method: 'DELETE', body: JSON.stringify({ confirmDeletion: true }) });
          setConfirmed(false); setAccepted(false);
          setConsent(await callApi('/consents')); setNotice('Your data was deleted and storage consent withdrawn.');
        })}>Delete my data</button>
      </>}
    </section>}
    <footer>Progress release • September 2026</footer>
  </main>;
};
createRoot(document.getElementById('root')).render(<App />);
