// Thin fetch wrapper for the Lanyard Worker API.
const BASE = ""; // same-origin; worker proxies /api/*

export async function api(path, method = "GET", data, token) {
  const headers = { "content-type": "application/json" };
  if (token) headers["x-lanyard-token"] = token;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
  return json;
}

export const passUrl = (id, helloNote = "") => {
  const note = String(helloNote || "").trim();
  return note ? `/p/${id}?n=${encodeURIComponent(note)}` : `/p/${id}`;
};

export const Api = {
  createProfile: (profile, token) => api("/api/profile", "POST", { profile, token }),
  updateProfile: (id, profile, token) => api(`/api/profile/${id}`, "PUT", { profile }, token),
  getProfile: (id) => api(`/api/profile/${id}`),
  getMine: (token) => api("/api/mine", "GET", undefined, token),
  login: (code, birthday, token) => api("/api/login", "POST", { code, birthday, token }),
  connect: (payload, token) => api("/api/connect", "POST", payload, token),
  connections: (id) => api(`/api/connections/${id}`),
  removeConnection: (ownerId, peerId, token) => api(`/api/connections/${ownerId}?peerId=${peerId}`, "DELETE", undefined, token),
  uploadPhoto: (dataUrl, a, b) => api("/api/photo", "POST", { dataUrl, a, b }),
  attachPhoto: (myId, peerId, photoId) => api("/api/photo/attach", "POST", { myId, peerId, photoId }),
  photoUrl: (photoId) => `/api/photo/${photoId}`,
  resolveCode: (code) => api(`/api/code/${encodeURIComponent(String(code).toUpperCase())}`),
  getThread: (myId, peerId, token) => api(`/api/thread/${myId}/${peerId}`, "GET", undefined, token),
  postThread: (myId, peerId, payload, token) => api(`/api/thread/${myId}/${peerId}`, "POST", payload, token),
};
