require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { twilio, restClient, mintToken, TWILIO_NUMBER, TWILIO_IDENTITY } = require('./twilio');
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
} = process.env;

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
    twiml.dial({ callerId: TWILIO_NUMBER }).number(to);
  } else {
    twiml.say('No destination number was provided.');
  }
  res.type('text/xml').send(twiml.toString());
});

// Inbound: the phone number's Voice URL. Ring the browser; fall back if nobody's registered.
app.post('/voice/incoming', validateTwilio, (_req, res) => {
  const VoiceResponse = twilio.twiml.VoiceResponse;
  const twiml = new VoiceResponse();
  const dial = twiml.dial({ timeout: 20 });
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
  events.broadcast('sms', entry);
  res.type('text/xml').send('<Response/>');
});

// Data for the UI.
app.get('/api/sms', requireAuth, async (_req, res) => {
  try {
    const messages = await restClient.messages.list({ limit: 50 });
    res.json(messages.map((m) => ({
      sid: m.sid,
      from: m.from,
      to: m.to,
      body: m.body || '',
      direction: m.direction,
      receivedAt: (m.dateSent || m.dateCreated) ? new Date(m.dateSent || m.dateCreated).toISOString() : null,
    })));
  } catch (e) {
    console.error('sms error', e);
    res.status(500).json({ error: 'could not load messages' });
  }
});
app.get('/api/calls', requireAuth, async (_req, res) => {
  try {
    const calls = await restClient.calls.list({ limit: 50 });
    res.json(calls.map(c => ({
      sid: c.sid,
      from: c.from,
      to: c.to,
      direction: c.direction,
      status: c.status,
      duration: c.duration,
      startTime: c.startTime,
    })));
  } catch (e) {
    console.error('calls error', e);
    res.status(500).json({ error: 'could not load call history' });
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
