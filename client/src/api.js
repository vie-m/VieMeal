// Tiny fetch wrapper: adds the JWT, parses JSON and throws readable errors.
// The server always returns errors as { "error": "message" }.
const TOKEN_KEY = 'viemeal_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error('Cannot reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event('viemeal:logout')); // AuthContext listens and logs out
    }
    const err = new Error(data?.error || `Something went wrong (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Shortcuts
api.get = (p) => api(p);
api.post = (p, body = {}) => api(p, { method: 'POST', body });
api.put = (p, body = {}) => api(p, { method: 'PUT', body });
api.del = (p) => api(p, { method: 'DELETE' });
