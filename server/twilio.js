const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_AUTH_TOKEN,
  TWILIO_TWIML_APP_SID,
  TWILIO_NUMBER,
  TWILIO_IDENTITY = 'webphone',
  TWILIO_REST_AUTH = 'apikey',
} = process.env;

// REST client (calls.list for history) authenticated with the API key — revocable on its
// own, so it's the right default. TWILIO_REST_AUTH=token swaps in the account's auth token
// instead, which unblocks history and messaging when the API key secret has been lost (it
// is shown once at creation and never again). Voice is unaffected by this switch: access
// tokens for the browser SDK can only be signed by an API key secret, so the dialer still
// needs a working key either way.
const useAuthToken = TWILIO_REST_AUTH === 'token';
const restClient = useAuthToken
  ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
  : twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID });
if (useAuthToken) console.warn('TWILIO_REST_AUTH=token — REST calls use the auth token; voice still needs a valid API key.');

// Mint a short-lived Voice access token the browser SDK registers with.
function mintToken() {
  const { AccessToken } = twilio.jwt;
  const { VoiceGrant } = AccessToken;
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, {
    identity: TWILIO_IDENTITY,
    ttl: 3600,
  });
  token.addGrant(new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID, // outbound: hits our /voice/outgoing
    incomingAllow: true,                          // inbound: allow <Client> to ring here
  }));
  return { token: token.toJwt(), identity: TWILIO_IDENTITY };
}

module.exports = {
  twilio,
  restClient,
  mintToken,
  TWILIO_NUMBER,
  TWILIO_IDENTITY,
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
};
