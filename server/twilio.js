const twilio = require('twilio');

const {
  TWILIO_ACCOUNT_SID,
  TWILIO_API_KEY_SID,
  TWILIO_API_KEY_SECRET,
  TWILIO_TWIML_APP_SID,
  TWILIO_NUMBER,
  TWILIO_IDENTITY = 'webphone',
} = process.env;

// REST client (calls.list for history) authenticated with the API key.
const restClient = twilio(TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET, { accountSid: TWILIO_ACCOUNT_SID });

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
