async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  state: () => request('GET', '/api/state'),
  models: (fresh) => request('GET', '/api/models' + (fresh ? '?fresh=1' : '')),
  saveProvider: (id, patch) => request('PUT', '/api/providers/' + id, patch),
  removeProvider: (id) => request('DELETE', '/api/providers/' + id),
  addProvider: (body) => request('POST', '/api/providers', body),
  oauthStart: (provider) => request('POST', '/api/oauth/start', { provider }),
  approve: (id, allow) => request('POST', '/api/approve', { id, allow }),
  setWorkspace: (path) => request('POST', '/api/workspace', { path }),
  browse: (path) => request('GET', '/api/browse' + (path ? '?path=' + encodeURIComponent(path) : '')),
  files: () => request('GET', '/api/files'),
  changes: () => request('GET', '/api/changes'),
  commit: (message) => request('POST', '/api/commit', { message }),
}
