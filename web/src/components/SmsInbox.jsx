import React, { useEffect, useState } from 'react';
import { api } from '../api';

const fmt = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return t; } };

export default function SmsInbox() {
  const [list, setList] = useState([]);
  const load = () => api.sms().then(setList).catch(console.error);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pane">
      <div className="pane-head">
        <h2>Messages</h2>
        <button className="chip-btn" onClick={load}>Refresh</button>
      </div>
      {list.length === 0 && <div className="empty">No messages yet.<br />Text your number to see it land here.</div>}
      <div className="feed">
        {list.map((m) => (
          <div key={m.id || m.sid} className="msg" style={{ '--i': 0 }}>
            <div className="msg-top"><span className="msg-from">{m.from}</span><span className="msg-time">{fmt(m.receivedAt)}</span></div>
            <div className="msg-body">{m.body}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
