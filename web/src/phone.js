import { Device } from '@twilio/voice-sdk';
import { api } from './api';

// Wrap the Twilio Voice Device: fetch a token, register, and surface events.
export async function createDevice({ onStatus, onIncoming }) {
  const { token } = await api.token();
  const device = new Device(token, { logLevel: 'error' });

  device.on('registered', () => onStatus('ready'));
  device.on('unregistered', () => onStatus('offline'));
  device.on('error', (e) => { console.error('Device error', e); onStatus('error'); });
  device.on('incoming', (call) => onIncoming(call));

  // Tokens expire (~1h) — refresh so the device stays registered.
  device.on('tokenWillExpire', async () => {
    try {
      const { token: fresh } = await api.token();
      device.updateToken(fresh);
    } catch (e) {
      console.error('token refresh failed', e);
    }
  });

  await device.register();
  return device;
}
