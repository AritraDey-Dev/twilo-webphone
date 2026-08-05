require('dotenv').config();
const path = require('path');
const { Readable } = require('stream');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const {
  twilio,
  restClient,
  mintToken,
  TWILIO_NUMBER,
  TWILIO_IDENTITY,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
} = require('./twilio');
const store = require('./store');
const events = require('./events');

const {
  PORT = 3000,
  SESSION_SECRET = 'dev-secret-change-me',
  APP_LOGIN_EMAIL,
  APP_LOGIN_PASSWORD,
  VALIDATE_TWILIO = 'false',
  PUBLIC_URL = '',
  TWILIO_AUTH_TOKEN,
  RECORD_CALLS = 'true',
} = process.env;

// Recording is opt-out via RECORD_CALLS=false. `record-from-answer-dual` starts the
// recording once the far end answers and keeps each party on its own channel.
const recordOpts = RECORD_CALLS === 'false' ? {} : { record: 'record-from-answer-dual' };

const app = express();
app.set('trust proxy', true);
app.use(express.urlencoded({ extended: false })); // Twilio webhooks post form-encoded
app.use(express.json());
app.use(cookieParser());

// ── App auth (single-user gate) ──
function issueSession(res) {
  const token = jwt.sign({ sub: APP_LOGIN_EMAIL }, SESSION_SECRET, { expiresIn: '12h' });
  res.cookie('session', token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
}
function requireAuth(req, res, next) {
  try {
    jwt.verify(req.cookies.session, SESSION_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'unauthorized' });
  }
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!APP_LOGIN_EMAIL || !APP_LOGIN_PASSWORD) {
    return res.status(500).json({ error: 'login not configured — set APP_LOGIN_EMAIL / APP_LOGIN_PASSWORD' });
  }
  if (email === APP_LOGIN_EMAIL && password === APP_LOGIN_PASSWORD) {
    issueSession(res);
    return res.json({ ok: true, identity: TWILIO_IDENTITY });
  }
  res.status(401).json({ error: 'invalid credentials' });
});
app.post('/api/logout', (req, res) => { res.clearCookie('session'); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (_req, res) => res.json({ identity: TWILIO_IDENTITY, number: TWILIO_NUMBER }));

// Voice access token for the browser SDK.
app.get('/api/token', requireAuth, (_req, res) => {
  try {
    res.json(mintToken());
  } catch (e) {
    console.error('token error', e);
    res.status(500).json({ error: 'token error — check Twilio env vars' });
  }
});

// ── Twilio webhook signature validation (opt-in via VALIDATE_TWILIO) ──
function validateTwilio(req, res, next) {
  if (VALIDATE_TWILIO !== 'true') return next();
  const signature = req.header('X-Twilio-Signature');
  const url = `${PUBLIC_URL.replace(/\/$/, '')}${req.originalUrl}`;
  if (twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body)) return next();
  console.warn('Rejected Twilio webhook — bad signature for', url);
  res.status(403).send('invalid signature');
}

// Outbound: the TwiML App's Voice URL. device.connect({params:{To}}) lands here.
app.post('/voice/outgoing', validateTwilio, (req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  const to = (req.body.To || '').trim();
  if (to) {
    twiml.dial({ callerId: TWILIO_NUMBER, ...recordOpts }).number(to);
  } else {
    twiml.say('No destination number was provided.');
  }
  res.type('text/xml').send(twiml.toString());
});

// Inbound: the phone number's Voice URL. Ring the browser; fall back if nobody's registered.
app.post('/voice/incoming', validateTwilio, (_req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  const dial = twiml.dial({ timeout: 20, ...recordOpts });
  dial.client(TWILIO_IDENTITY);
  twiml.say('Sorry, no one is available to take your call. Goodbye.');
  res.type('text/xml').send(twiml.toString());
});

// Inbound SMS: the phone number's Messaging URL. Store + push to the UI.
app.post('/sms/incoming', validateTwilio, (req, res) => {
  const entry = store.addSms({
    from: req.body.From,
    to: req.body.To,
    body: req.body.Body || '',
    sid: req.body.MessageSid,
    receivedAt: new Date().toISOString(),
  });
  windows.delete('sms'); // so the next load sees the message that just landed
  events.broadcast('sms', entry);
  res.type('text/xml').send('<Response/>');
});

// ── Pagination ──
// Twilio's list API is cursor-based and never reports a total, so "page 7 of 23" can't be
// built from it directly. Instead we pull history in 1000-row gulps (Twilio's max page),
// normalise it down to the few fields the UI wants, and cache that window briefly. One gulp
// covers 100 screens at 10 rows each, so paging is nearly always a cache hit, and the row
// count is exact for any account that fits inside MAX_RECORDS.
// The browser always sends pageSize (see web/src/usePaged.js); this is the fallback for
// a request that omits it. Keep the two in step so both paths page identically.
const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;
const GULP = 1000;          // Twilio's maximum page size
const MAX_RECORDS = 3000;   // hard ceiling on how far back the selector can reach
const WINDOW_TTL = 30000;

function pageSizeOf(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return PAGE_SIZE_DEFAULT;
  return Math.min(PAGE_SIZE_MAX, Math.max(1, n));
}

const windows = new Map(); // kind → { at, records, exact }

// `keep` runs on raw Twilio records, `normalise` shrinks the survivors to plain objects —
// holding 3000 live SDK instances in memory would be far heavier than we need.
async function fetchWindow(kind, list, normalise, keep) {
  const hit = windows.get(kind);
  if (hit && Date.now() - hit.at < WINDOW_TTL) return hit;
  const records = [];
  let seen = 0;
  let exact = true;
  let page = await list.page({ pageSize: GULP });
  for (;;) {
    seen += page.instances.length;
    for (const r of page.instances) if (!keep || keep(r)) records.push(normalise(r));
    if (!page.nextPageUrl) break;
    if (seen >= MAX_RECORDS) { exact = false; break; }
    page = await page.nextPage();
  }
  const win = { at: Date.now(), records, exact };
  windows.set(kind, win);
  return win;
}

// Offset paging out of the cached window. The page number is clamped, so a stale
// selector value can't land the UI on an empty page.
function slicePage(records, pageParam, pageSize) {
  const total = records.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, Number.parseInt(pageParam, 10) || 1), pageCount);
  return { items: records.slice((page - 1) * pageSize, page * pageSize), page, pageCount, total };
}

const E164 = /^\+[1-9]\d{6,14}$/;
const SMS_MAX_CHARS = 1600; // Twilio splits anything longer than one segment; this is its hard cap.

const toSms = (m) => ({
  sid: m.sid,
  from: m.from,
  to: m.to,
  body: m.body || '',
  direction: m.direction,
  status: m.status,
  receivedAt: (m.dateSent || m.dateCreated) ? new Date(m.dateSent || m.dateCreated).toISOString() : null,
});

// Data for the UI. `fresh=1` bypasses the window cache — the Refresh button and a
// newly-arrived message both need to see past it.
app.get('/api/sms', requireAuth, async (req, res) => {
  try {
    if (req.query.fresh) windows.delete('sms');
    const win = await fetchWindow('sms', restClient.messages, toSms);
    res.json({ ...slicePage(win.records, req.query.page, pageSizeOf(req.query.pageSize)), exact: win.exact });
  } catch (e) {
    console.error('sms error', e);
    res.status(500).json({ error: 'could not load messages' });
  }
});

// Outbound SMS. US/Canada long codes need A2P 10DLC registration before Twilio will
// deliver — an unregistered number fails here with Twilio's own error text (30034 etc.),
// which we pass straight through rather than flattening into a generic message.
app.post('/api/sms', requireAuth, async (req, res) => {
  const to = String((req.body && req.body.to) || '').replace(/[\s()-]/g, '');
  const body = String((req.body && req.body.body) || '').trim();
  if (!E164.test(to)) return res.status(400).json({ error: 'Enter the number in E.164 form, e.g. +14155550123' });
  if (!body) return res.status(400).json({ error: 'Write a message first.' });
  if (body.length > SMS_MAX_CHARS) return res.status(400).json({ error: `Message is too long (max ${SMS_MAX_CHARS} characters).` });
  if (!TWILIO_NUMBER) return res.status(500).json({ error: 'TWILIO_NUMBER is not configured.' });
  try {
    const message = await restClient.messages.create({ to, from: TWILIO_NUMBER, body });
    const entry = toSms(message);
    windows.delete('sms'); // the window is now a message short
    events.broadcast('sms', entry);
    res.status(201).json(entry);
  } catch (e) {
    console.error('send sms error', e);
    const status = e.status >= 400 && e.status < 500 ? 400 : 502;
    res.status(status).json({ error: e.message || 'could not send message' });
  }
});

// Recordings attach to the leg that ran <Dial>: the PSTN leg on inbound calls, the
// browser-client parent leg on outbound ones. Index by call SID so either can find it.
// Scoped to the time window this page of calls covers, so page 40 resolves its own
// recordings instead of only the newest ones on the account.
async function recordingsForCalls(calls) {
  const times = calls
    .map((c) => (c.startTime ? new Date(c.startTime).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const map = new Map();
  if (!times.length) return map;
  const HOUR = 3600 * 1000;
  const recordings = await restClient.recordings.list({
    dateCreatedAfter: new Date(Math.min(...times) - HOUR),
    dateCreatedBefore: new Date(Math.max(...times) + HOUR),
    limit: 200,
  });
  for (const r of recordings) if (!map.has(r.callSid)) map.set(r.callSid, r);
  return map;
}

// Every call has two legs — the browser-client one and the real-number one. Drop the
// client leg so a page holds the rows the UI actually renders, and so the total the
// selector shows counts calls rather than legs.
const isClientLeg = (c) => (c.from || '').startsWith('client:') || (c.to || '').startsWith('client:');

const toCall = (c) => ({
  sid: c.sid,
  parentCallSid: c.parentCallSid || null,
  from: c.from,
  to: c.to,
  direction: c.direction,
  status: c.status,
  duration: c.duration,
  startTime: c.startTime,
  recordingSid: null, // filled in per page — see recordingsForCalls
});

app.get('/api/calls', requireAuth, async (req, res) => {
  try {
    if (req.query.fresh) windows.delete('calls');
    const win = await fetchWindow('calls', restClient.calls, toCall, (c) => !isClientLeg(c));
    const { items, page, pageCount, total } = slicePage(win.records, req.query.page, pageSizeOf(req.query.pageSize));
    // Recordings are a bonus on this view — never fail the history over them. Looked up
    // for the ten rows being served, not the whole window.
    const recs = await recordingsForCalls(items).catch(() => new Map());
    res.json({
      items: items.map((c) => {
        const rec = recs.get(c.sid) || (c.parentCallSid ? recs.get(c.parentCallSid) : null);
        return rec ? { ...c, recordingSid: rec.sid } : c;
      }),
      page,
      pageCount,
      total,
      exact: win.exact,
    });
  } catch (e) {
    console.error('calls error', e);
    res.status(500).json({ error: 'could not load call history' });
  }
});

// Twilio's media URL needs API credentials, so stream it through the session instead of
// handing the browser a signed URL. Range headers pass through so <audio> can seek.
app.get('/api/recordings/:sid/media', requireAuth, async (req, res) => {
  const { sid } = req.params;
  if (!/^RE[0-9a-f]{32}$/i.test(sid)) return res.status(400).json({ error: 'bad recording sid' });
  try {
    const auth = Buffer.from(`${TWILIO_API_KEY_SID}:${TWILIO_API_KEY_SECRET}`).toString('base64');
    const headers = { Authorization: `Basic ${auth}` };
    if (req.headers.range) headers.Range = req.headers.range;
    const upstream = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${sid}.mp3`,
      { headers },
    );
    if (!upstream.ok && upstream.status !== 206) {
      return res.status(upstream.status === 404 ? 404 : 502).json({ error: 'recording unavailable' });
    }
    res.status(upstream.status);
    for (const h of ['content-type', 'content-length', 'accept-ranges', 'content-range']) {
      const v = upstream.headers.get(h);
      if (v) res.set(h, v);
    }
    res.set('Cache-Control', 'private, max-age=3600');
    if (req.query.download !== undefined) res.set('Content-Disposition', `attachment; filename="${sid}.mp3"`);
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    console.error('recording media error', e);
    if (!res.headersSent) res.status(500).json({ error: 'could not load recording audio' });
    else res.end();
  }
});

// Live inbound-SMS stream.
app.get('/events', requireAuth, (_req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write('event: ping\ndata: {}\n\n');
  events.addClient(res);
});

// ── Static (prod) — serve the built React app for everything else ──
const dist = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(dist));
app.get('*', (req, res, next) => {
  if (/^\/(api|voice|sms|events)\b/.test(req.path)) return next();
  res.sendFile(path.join(dist, 'index.html'), (err) => { if (err) next(); });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`Web Phone server → http://localhost:${PORT}`));
}

module.exports = app;
