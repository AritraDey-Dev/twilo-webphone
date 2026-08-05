import React, { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { createDevice, describeError } from "./phone";
import Login from "./components/Login.jsx";
import Dialer from "./components/Dialer.jsx";
import IncomingCall from "./components/IncomingCall.jsx";
import SmsInbox from "./components/SmsInbox.jsx";
import CallHistory from "./components/CallHistory.jsx";
import {
  IconKeypad,
  IconMessage,
  IconPhone,
  IconSupport,
  IconLogout,
} from "./components/icons.jsx";

const TABS = [
  ["dialer", "Keypad", IconKeypad],
  ["sms", "Messages", IconMessage],
  ["calls", "Calls", IconPhone],
];
const STATUS_LABEL = {
  ready: "Live",
  offline: "Offline",
  connecting: "Connecting",
  error: "Error",
};

function Blobs() {
  return (
    <div className="blobs">
      <div className="blob b1" />
      <div className="blob b2" />
      <div className="blob b3" />
      <div className="blob b4" />
    </div>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(null);
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState("connecting");
  const [statusMsg, setStatusMsg] = useState(null);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("dialer");
  const [incoming, setIncoming] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const deviceRef = useRef(null);

  useEffect(() => {
    api
      .me()
      .then((m) => {
        setMe(m);
        setAuthed(true);
      })
      .catch(() => setAuthed(false));
  }, []);

  useEffect(() => {
    if (authed !== true) return;
    let device;
    setStatus("connecting");
    setStatusMsg(null);
    createDevice({
      onStatus: (state, message) => {
        setStatus(state);
        setStatusMsg(message || null);
      },
      onIncoming: (call) => {
        setIncoming(call);
        call.on("cancel", () => setIncoming(null));
        call.on("disconnect", () => {
          setIncoming(null);
          setActiveCall(null);
        });
        call.on("reject", () => setIncoming(null));
      },
    })
      .then((d) => {
        device = d;
        deviceRef.current = d;
      })
      .catch((e) => {
        console.error(e);
        setStatus("error");
        setStatusMsg(describeError(e));
      });
    return () => {
      try {
        device && device.destroy();
      } catch {
        /* noop */
      }
    };
  }, [authed, retry]);

  if (authed === null)
    return (
      <div className="boot">
        Web Phone<span className="blink">_</span>
      </div>
    );
  if (!authed) return <Login onLoggedIn={() => window.location.reload()} />;

  const startCall = async (number) => {
    const device = deviceRef.current;
    if (!device) return;
    const call = await device.connect({ params: { To: number } });
    setActiveCall(call);
    call.on("disconnect", () => setActiveCall(null));
    call.on("cancel", () => setActiveCall(null));
    call.on("error", () => setActiveCall(null));
  };
  const hangup = () => {
    if (activeCall) activeCall.disconnect();
    setActiveCall(null);
  };
  const acceptIncoming = () => {
    if (!incoming) return;
    incoming.accept();
    setActiveCall(incoming);
    setIncoming(null);
  };
  const rejectIncoming = () => {
    if (incoming) incoming.reject();
    setIncoming(null);
  };
  const logout = async () => {
    await api.logout();
    window.location.reload();
  };

  const PAGE = {
    dialer: { title: "Keypad", sub: "Place a call from your line." },
    sms: { title: "Messages", sub: "Send and read text messages." },
    calls: { title: "Calls", sub: "Your recent call activity." },
  }[tab];

  return (
    <>
      <Blobs />
      <div className="app">
        <aside className="sidebar">
          <div className="sb-logo">
            <div className="name">Web Phone</div>
          </div>

          <nav className="sb-nav">
            {TABS.map(([t, label, Icon]) => (
              <button
                key={t}
                className={`sb-item ${tab === t ? "active" : ""}`}
                onClick={() => setTab(t)}
              >
                <Icon />
                <span>{label}</span>
              </button>
            ))}
          </nav>

          <div className="sb-foot">
            <div className="sb-status">
              {/* `is-` prefixed so a status of "error" can't collide with the .error
                  alert class and inflate the dot into a padded box. */}
              <span
                className={`beacon is-${status}`}
                title={statusMsg || STATUS_LABEL[status] || status}
              />
              <span className="s-label">{STATUS_LABEL[status] || status}</span>
              <span className="s-num">{me?.number}</span>
            </div>
            <button className="sb-action">
              <IconSupport />
              <span>Need support</span>
            </button>
            <button className="sb-action danger" onClick={logout}>
              <IconLogout />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        <main className="main">
          <h1 className="page-title">{PAGE.title}</h1>
          <p className="page-sub">{PAGE.sub}</p>

          {status === "error" && (
            <div className="alert">
              <div className="alert-text">
                <strong>The phone isn’t registered.</strong>{" "}
                {statusMsg || "The Twilio device could not connect."}
              </div>
              <button
                className="alert-retry"
                onClick={() => setRetry((n) => n + 1)}
              >
                Reconnect
              </button>
            </div>
          )}

          {tab === "dialer" && (
            <div className="card dialer">
              <Dialer
                onCall={startCall}
                activeCall={activeCall}
                onHangup={hangup}
                status={status}
              />
            </div>
          )}
          {tab === "sms" && <SmsInbox />}
          {tab === "calls" && <CallHistory />}
        </main>

        {incoming && (
          <IncomingCall
            call={incoming}
            onAccept={acceptIncoming}
            onReject={rejectIncoming}
          />
        )}
      </div>
    </>
  );
}
