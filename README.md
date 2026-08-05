# Web Phone

A browser softphone on Twilio — **make calls · receive calls · send & receive SMS**. React (Vite) + Node/Express.

Voice works with zero compliance paperwork. **Outbound SMS on a US/Canada long code additionally needs
[A2P 10DLC registration](https://www.twilio.com/docs/messaging/compliance/a2p-10dlc)** — until the number is
registered, sends fail and Twilio's own error (e.g. `30034`) is shown in the composer.

## What's inside
- `server/` — Express: mints Twilio access tokens, serves TwiML for outbound/inbound voice, sends and receives SMS,
  streams inbound ones live (SSE), and pages through call + message history.
- `web/` — React UI: dialer, incoming-call answer/reject, SMS composer + threaded history, call history with
  recording playback. Both history views page through Twilio's full record via cursor pagination.

## 1. Install
```bash
npm run setup          # installs server + web deps
cp .env.example .env    # then fill it in (see below)
```

## 2. Twilio Console setup (one time)
You need an **upgraded** account and a **phone number**.
1. **API key** — Account → *API keys & tokens* → Create → copy the **SID** and **Secret** into
   `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`.
2. **TwiML App** — Voice → TwiML → *TwiML Apps* → create one. Set its **Voice URL** to
   `PUBLIC_URL/voice/outgoing` (POST). Copy its **SID** into `TWILIO_TWIML_APP_SID`.
3. **Phone number** — Phone Numbers → your number:
   - **Voice → A call comes in**: `PUBLIC_URL/voice/incoming` (POST)
   - **Messaging → A message comes in**: `PUBLIC_URL/sms/incoming` (POST)
4. Fill the rest of `.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_NUMBER`, and an `APP_LOGIN_*`).

## 3. Expose webhooks (local dev)
Twilio must reach your machine, so tunnel port 3000:
```bash
ngrok http 3000
```
Copy the `https://…ngrok…` URL into `PUBLIC_URL` in `.env`, and use it for the three webhook URLs above.
(Re-running ngrok gives a new URL — update `.env` + the Console each time, or use a reserved domain.)

## 4. Run
```bash
npm run dev            # Express :3000 + Vite :5173
```
Open **http://localhost:5173**, sign in with your `APP_LOGIN_*`, and the status should go **Ready**.
Once it's working, set `VALIDATE_TWILIO=true` in `.env` to verify webhook signatures.

## 5. Verify (real account)
- **Make a call** — dial your cell → it rings → answer → two-way audio → Hang Up.
- **Receive a call** — call your Twilio number → the browser shows *Incoming* → Answer.
- **Receive SMS** — text your Twilio number → it appears in *Messages* live.
- **Send SMS** — *Messages* → enter an E.164 number + body → Send (needs A2P 10DLC on US/CA long codes).
- **History** — *Calls* and *Messages* populate from Twilio's API; **Older / Newer** walks back through it a page
  at a time (the newest page auto-refreshes; paged-back views hold still).

## Production
```bash
npm run build          # builds the React app into web/dist
npm start              # Express serves web/dist + the API on one port
```
Point the three Twilio webhook URLs at your deployed HTTPS host instead of ngrok.

## Notes
- A browser softphone only rings **while the tab is open and registered**. `server/voice/incoming` includes a
  `<Say>` fallback for when nobody's registered — swap it for `<Record>` (voicemail) or a `<Dial>` to your cell.
- Received SMS persist in `server/sms-store.json` (gitignored). Swap for a DB later if you want.
- Adding **outbound SMS** later means registering A2P 10DLC in the Twilio Console first.
