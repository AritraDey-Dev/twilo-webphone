// Dev-only: serve the built UI with stubbed data so the design can be screenshotted.
const express = require("express");
const path = require("path");
const app = express();
const dist = path.join(__dirname, "..", "web", "dist");

const NUMBER = "+14177594208";
const SMS_COUNT = 87; // uneven totals, so the last page is a partial one
const CALL_COUNT = 63;
const ago = (mins) => new Date(Date.now() - mins * 60e3).toISOString();

// Mirrors the server's offset paging: { items, page, pageCount, total, exact }.
function pageOut(all, query) {
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize, 10) || 10));
  const pageCount = Math.max(1, Math.ceil(all.length / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(query.page, 10) || 1), pageCount);
  return {
    items: all.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageCount,
    total: all.length,
    exact: true,
  };
}

const BODIES = [
  "Hey — are we still on for 3pm?",
  "Yep, see you then.",
  "Your verification code is 448120.",
  "Package delivered to front door.",
  "Running ten minutes late, sorry!",
  "Got it, no rush.",
];

// A real (if boring) 15-second tone, so the play button in Calls actually plays
// something and the progress bar has a duration to track.
const REC_SECONDS = 15;
function tone(seconds, freq = 320, rate = 8000) {
  const n = seconds * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(
      Math.round(Math.sin((2 * Math.PI * freq * i) / rate) * 2500),
      44 + i * 2,
    );
  }
  return buf;
}
const TONE = tone(REC_SECONDS);

app.use(express.json());
app.get("/api/me", (_q, r) => r.json({ identity: "webphone", number: NUMBER }));
app.get("/api/recordings/:sid/media", (_q, r) =>
  r.type("audio/wav").send(TONE),
);
app.get("/api/token", (_q, r) =>
  r.json({ token: "stub.eyJncmFudHMiOnt9fQ.stub", identity: "webphone" }),
);

const SMS_ALL = Array.from({ length: SMS_COUNT }, (_, k) => {
  const out = k % 3 === 1;
  return {
    sid: `m${k}`,
    from: out ? NUMBER : "+14155550123",
    to: out ? "+14155550123" : NUMBER,
    direction: out ? "outbound-api" : "inbound",
    status: out ? "delivered" : "received",
    body: BODIES[k % BODIES.length],
    receivedAt: ago(k * 47),
  };
});

app.get("/api/sms", (q, r) => r.json(pageOut(SMS_ALL, q.query)));

app.post("/api/sms", (q, r) =>
  r.status(201).json({
    sid: `m${Date.now()}`,
    from: NUMBER,
    to: q.body.to,
    body: q.body.body,
    direction: "outbound-api",
    status: "queued",
    receivedAt: new Date().toISOString(),
  }),
);

const CALLS_ALL = Array.from({ length: CALL_COUNT }, (_, k) => {
  const inbound = k % 2 === 0;
  const missed = k % 5 === 3;
  const recorded = !missed && k % 3 !== 2; // missed calls never have a recording
  return {
    sid: `c${k}`,
    from: inbound ? "+14155550123" : NUMBER,
    to: inbound ? NUMBER : "+12025550188",
    direction: inbound ? "inbound" : "outbound-dial",
    status: missed ? "no-answer" : "completed",
    duration: missed ? "0" : String(recorded ? REC_SECONDS : 20 + k * 7),
    startTime: ago(k * 123),
    recordingSid: recorded ? `RE${String(k).padStart(32, "0")}` : null,
  };
});

app.get("/api/calls", (q, r) => r.json(pageOut(CALLS_ALL, q.query)));

app.get("/events", (_q, r) => {
  r.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  r.flushHeaders();
  r.write("event: ping\ndata: {}\n\n");
});
app.use(express.static(dist));
app.get("*", (_q, r) => r.sendFile(path.join(dist, "index.html")));
app.listen(4321, () => console.log("preview on http://localhost:4321"));
