import React, { useEffect, useState } from 'react';
import { api } from '../api';

const fmt = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return t; } };
const isClient = (s) => (s || '').startsWith('client:');
const isInbound = (d) => (d || '').includes('inbound');

export default function CallHistory() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = () => { setLoading(true); api.calls().then(setList).catch(console.error).finally(() => setLoading(false)); };
  useEffect(load, []);

  // Each call has two legs: the browser-client leg and the real-number leg.
  // Keep only the PSTN-facing leg so the direction and number are correct.
  const rows = list.filter((c) => !isClient(c.from) && !isClient(c.to));

  return (
    <div className="pane">
      <div className="pane-head">
        <h2>Calls</h2>
        <button className="chip-btn" onClick={load}>Refresh</button>
      </div>
      {loading && <div className="empty">Loading…</div>}
      {!loading && rows.length === 0 && <div className="empty">No calls yet.</div>}
      <div className="feed">
        {rows.map((c) => {
          const inbound = isInbound(c.direction);
          const num = inbound ? c.from : c.to;
          return (
            <div key={c.sid} className="callrow">
              <span className={`arrow ${inbound ? 'in' : 'out'}`}>{inbound ? '↙' : '↗'}</span>
              <div className="callrow-mid">
                <span className="callrow-num">{num || 'Unknown'}</span>
                <span className="callrow-sub">{c.status} · {c.duration || 0}s</span>
              </div>
              <span className="callrow-time">{fmt(c.startTime)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
