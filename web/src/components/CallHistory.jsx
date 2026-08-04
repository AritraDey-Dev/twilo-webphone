import React, { useEffect, useRef, useState } from 'react';
import { api, recordingMedia } from '../api';
import { IconPlay, IconStop } from './icons.jsx';

const fmt = (t) => { try { return new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return t; } };
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const isClient = (s) => (s || '').startsWith('client:');
const isInbound = (d) => (d || '').includes('inbound');

export default function CallHistory() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(null); // sid of the row currently playing
  const [pos, setPos] = useState(0);
  const [failed, setFailed] = useState(null);
  const audioRef = useRef(null);

  const load = () => { setLoading(true); api.calls().then(setList).catch(console.error).finally(() => setLoading(false)); };
  useEffect(load, []);

  // One shared <audio> — playing a row stops whatever was playing before.
  const toggle = (call) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing === call.sid) { audio.pause(); setPlaying(null); return; }
    setFailed(null);
    setPos(0);
    audio.src = recordingMedia(call.recordingSid);
    setPlaying(call.sid);
    audio.play().catch(() => { setPlaying(null); setFailed(call.sid); });
  };

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
          const active = playing === c.sid;
          const total = Number(c.duration || 0);
          return (
            <div key={c.sid} className={`callrow ${active ? 'playing' : ''}`}>
              <span className={`arrow ${inbound ? 'in' : 'out'}`}>{inbound ? '↙' : '↗'}</span>
              <div className="callrow-mid">
                <span className="callrow-num">{num || 'Unknown'}</span>
                <span className="callrow-sub">
                  {active ? `Playing · ${clock(pos)} / ${clock(total)}` : `${c.status} · ${total}s`}
                  {failed === c.sid && ' · recording unavailable'}
                </span>
              </div>
              <span className="callrow-time">{fmt(c.startTime)}</span>
              {c.recordingSid && (
                <button
                  className={`play-btn ${active ? 'on' : ''}`}
                  onClick={() => toggle(c)}
                  aria-label={active ? 'Stop recording' : 'Play recording'}
                  title={active ? 'Stop' : 'Play recording'}
                >
                  {active ? <IconStop /> : <IconPlay />}
                </button>
              )}
              {active && total > 0 && <span className="play-bar" style={{ width: `${Math.min(100, (pos / total) * 100)}%` }} />}
            </div>
          );
        })}
      </div>

      <audio
        ref={audioRef}
        preload="none"
        onTimeUpdate={(e) => setPos(e.currentTarget.currentTime)}
        onEnded={() => { setPlaying(null); setPos(0); }}
        onError={() => { if (playing) { setFailed(playing); setPlaying(null); } }}
        style={{ display: 'none' }}
      />
    </div>
  );
}
