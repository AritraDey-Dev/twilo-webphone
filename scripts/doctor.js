// Validates .env shape + does a live Twilio auth check. Prints masked values only.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const twilio = require('twilio');

const mask = (v) => (v ? `${v.slice(0, 4)}…${v.slice(-2)} (len ${v.length})` : '(empty)');
const check = (name, val, { prefix, len } = {}) => {
  const problems = [];
  if (!val) problems.push('MISSING');
  if (val && prefix && !val.startsWith(prefix)) problems.push(`should start with "${prefix}"`);
  if (val && val.includes(' ')) problems.push('has a space');
  if (val && (val.startsWith('"') || val.startsWith("'"))) problems.push('remove quotes');
  if (val && /x{6,}/i.test(val)) problems.push('still a placeholder');
  if (val && len && Math.abs(val.length - len) > 4) problems.push(`unexpected length (~${len} expected)`);
  const ok = problems.length === 0;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'}  ${name.padEnd(24)} ${mask(val)}${ok ? '' : '  ← ' + problems.join(', ')}`);
  return ok;
};

const e = process.env;
console.log('\n── .env shape ──');
let ok = true;
ok &= check('TWILIO_ACCOUNT_SID', e.TWILIO_ACCOUNT_SID, { prefix: 'AC', len: 34 });
ok &= check('TWILIO_API_KEY_SID', e.TWILIO_API_KEY_SID, { prefix: 'SK', len: 34 });
ok &= check('TWILIO_API_KEY_SECRET', e.TWILIO_API_KEY_SECRET, { len: 32 });
ok &= check('TWILIO_AUTH_TOKEN', e.TWILIO_AUTH_TOKEN, { len: 32 });
ok &= check('TWILIO_TWIML_APP_SID', e.TWILIO_TWIML_APP_SID, { prefix: 'AP', len: 34 });
ok &= check('TWILIO_NUMBER', e.TWILIO_NUMBER, { prefix: '+' });

if (e.TWILIO_API_KEY_SECRET && e.TWILIO_AUTH_TOKEN && e.TWILIO_API_KEY_SECRET === e.TWILIO_AUTH_TOKEN) {
  console.log('\n  ⚠  API_KEY_SECRET === AUTH_TOKEN — you likely pasted the Auth Token into the API key secret.');
}

console.log('\n── access token (what the browser registers with) ──');
try {
  const { mintToken } = require('../server/twilio');
  const { token, identity } = mintToken();
  const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
  const grant = (payload.grants && payload.grants.voice) || {};
  const appSid = grant.outgoing && grant.outgoing.application_sid;
  console.log(`  identity            : ${identity}`);
  console.log(`  voice grant present : ${payload.grants && payload.grants.voice ? 'yes' : 'NO ← problem'}`);
  console.log(`  incoming allowed    : ${grant.incoming && grant.incoming.allow ? 'yes' : 'no'}`);
  console.log(`  outgoing app sid    : ${appSid || '(none)'} ${appSid === e.TWILIO_TWIML_APP_SID ? 'matches TwiML App ✓' : '← does NOT match TWILIO_TWIML_APP_SID'}`);
  const now = Math.floor(Date.now() / 1000);
  console.log(`  expires in          : ${payload.exp - now}s ${payload.exp - now > 0 ? '' : '← already expired (server clock skew?)'}`);
  console.log(`  signing key (iss)   : ${payload.iss} ${payload.iss === e.TWILIO_API_KEY_SID ? 'matches API key ✓' : '← does NOT match TWILIO_API_KEY_SID'}`);
} catch (err) {
  console.log('  FAIL minting token:', err.message);
}

(async () => {
  console.log('\n── live auth check (calls Twilio) ──');
  try {
    const client = twilio(e.TWILIO_API_KEY_SID, e.TWILIO_API_KEY_SECRET, { accountSid: e.TWILIO_ACCOUNT_SID });
    const acct = await client.api.accounts(e.TWILIO_ACCOUNT_SID).fetch();
    console.log(`  OK   authenticated — account "${acct.friendlyName}" status: ${acct.status}`);
  } catch (err) {
    console.log(`  FAIL ${err.code || ''} ${err.message}`);
    if (err.code === 20003) console.log('       → API key SID/secret or account SID is wrong (see the FAILs above).');
  }
})();
