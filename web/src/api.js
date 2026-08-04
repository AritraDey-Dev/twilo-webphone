async function req(path, opts = {}) {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (email, password) => req('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/api/logout', { method: 'POST' }),
  me: () => req('/api/me'),
  token: () => req('/api/token'),
  sms: () => req('/api/sms'),
  calls: () => req('/api/calls'),
};

export const recordingMedia = (sid) => `/api/recordings/${sid}/media`;
