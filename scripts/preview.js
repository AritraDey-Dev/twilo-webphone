// Dev-only: serve the built UI with stubbed data so the design can be screenshotted.
const express = require('express');
const path = require('path');
const app = express();
const dist = path.join(__dirname, '..', 'web', 'dist');

app.get('/api/me', (_q, r) => r.json({ identity: 'webphone', number: '+1 417 759 4208' }));
app.get('/api/token', (_q, r) => r.json({ token: 'stub.eyJncmFudHMiOnt9fQ.stub', identity: 'webphone' }));
app.get('/api/sms', (_q, r) => r.json([
  { id: '1', from: '+14155550123', body: 'Hey — are we still on for 3pm?', receivedAt: new Date().toISOString() },
  { id: '2', from: '+18005551234', body: 'Your verification code is 448120.', receivedAt: new Date(Date.now() - 3600e3).toISOString() },
  { id: '3', from: '+12025550188', body: 'Package delivered to front door.', receivedAt: new Date(Date.now() - 9000e3).toISOString() },
]));
app.get('/api/calls', (_q, r) => r.json([
  { sid: 'c1', from: '+14155550123', to: '+14177594208', direction: 'inbound', status: 'completed', duration: '92', startTime: new Date().toISOString() },
  { sid: 'c2', from: '+14177594208', to: '+12025550188', direction: 'outbound-dial', status: 'completed', duration: '20', startTime: new Date(Date.now() - 7200e3).toISOString() },
  { sid: 'c3', from: '+13105550111', to: '+14177594208', direction: 'inbound', status: 'no-answer', duration: '0', startTime: new Date(Date.now() - 86400e3).toISOString() },
]));
app.get('/events', (_q, r) => { r.set({ 'Content-Type': 'text/event-stream' }); r.write('event: ping\ndata: {}\n\n'); });
app.use(express.static(dist));
app.get('*', (_q, r) => r.sendFile(path.join(dist, 'index.html')));
app.listen(4321, () => console.log('preview on http://localhost:4321'));
