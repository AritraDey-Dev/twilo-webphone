import React, { useEffect, useRef, useState } from 'react';
import { IconBackspace, IconPhone } from './icons.jsx';

const KEYS = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

const clean = (s) => s.replace(/[^\d+*#\s()-]/g, '');
const toDial = (s) => s.replace(/[^\d+*#]/g, '');
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function Dialer({ onCall, activeCall, onHangup, status }) {
  const [num, setNum] = useState('');
  const [startedAt, setStartedAt] = useState(null); // when the far end picked up
  const [elapsed, setElapsed] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Time from answer, not from dial — ringing isn't call time.
  useEffect(() => {
    setElapsed(0);
    if (!activeCall) { setStartedAt(null); return undefined; }
    // An incoming call answered from the overlay is already open by the time it lands here.
    if (activeCall.status?.() === 'open') setStartedAt(Date.now());
    else setStartedAt(null);
    const onAccept = () => setStartedAt(Date.now());
    activeCall.on('accept', onAccept);
    return () => { try { activeCall.off('accept', onAccept); } catch { /* noop */ } };
  }, [activeCall]);

  // Tick off a stored timestamp so a throttled background tab can't drift the count.
  useEffect(() => {
    if (!startedAt) return undefined;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [startedAt]);

  const press = (k) => { setNum((n) => clean(n + k)); inputRef.current?.focus(); };
  const back = () => setNum((n) => n.slice(0, -1));
  const call = () => { const d = toDial(num); if (d) onCall(d); };
  const onKeyDown = (e) => { if (e.key === 'Enter' && status === 'ready') call(); };

  return (
    <>
      <div className="num-field">
        <input
          ref={inputRef}
          className="num-input"
          value={num}
          onChange={(e) => setNum(clean(e.target.value))}
          onKeyDown={onKeyDown}
          placeholder="Enter a number"
          inputMode="tel"
          autoComplete="off"
          spellCheck="false"
          aria-label="Phone number"
        />
        <button className="bksp" onClick={back} disabled={!num} aria-label="Backspace"><IconBackspace /></button>
      </div>

      <div className="keypad">
        {KEYS.map(([k, sub]) => (
          <button key={k} className="key" onClick={() => press(k)} tabIndex={-1}>
            <span className="key-main">{k}</span>
            <span className="key-sub">{sub}</span>
          </button>
        ))}
      </div>

      {activeCall ? (
        <>
          <div className={`call-live ${startedAt ? 'on' : ''}`}>
            <span className={`beacon ${startedAt ? 'is-ready' : 'is-connecting'}`} />
            <span className="call-live-label">{startedAt ? 'In call' : 'Connecting…'}</span>
            {startedAt && <span className="call-live-time">{clock(elapsed)}</span>}
          </div>
          <button className="btn-hangup" onClick={onHangup}>End call</button>
        </>
      ) : (
        <button className="btn-call" onClick={call} disabled={status !== 'ready' || !toDial(num)}>
          <IconPhone /> Call
        </button>
      )}
    </>
  );
}
