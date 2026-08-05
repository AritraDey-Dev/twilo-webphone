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

// Paged endpoints take { page, pageSize, fresh } and answer
// { items, page, pageCount, total, exact }.
function paged(path, { page, pageSize, fresh } = {}) {
  const qs = new URLSearchParams();
  if (page) qs.set('page', page);
  if (pageSize) qs.set('pageSize', pageSize);
  if (fresh) qs.set('fresh', '1');
  const query = qs.toString();
  return req(query ? `${path}?${query}` : path);
}

export const api = {
  login: (email, password) => req('/api/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => req('/api/logout', { method: 'POST' }),
  me: () => req('/api/me'),
  token: () => req('/api/token'),
  sms: (opts) => paged('/api/sms', opts),
  sendSms: (to, body) => req('/api/sms', { method: 'POST', body: JSON.stringify({ to, body }) }),
  calls: (opts) => paged('/api/calls', opts),
};

export const recordingMedia = (sid) => `/api/recordings/${sid}/media`;
