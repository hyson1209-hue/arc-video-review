// api.js — 백엔드 호출 래퍼
async function j(res) {
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}
export const fetchVideos = () => fetch("/api/videos").then(j);
export const fetchReport = (id) => fetch(`/api/videos/${id}/report`).then(j);
export const searchApi = (q, mode) => fetch(`/api/search?q=${encodeURIComponent(q)}&mode=${mode}`).then(j);
export const deleteVideo = (id) => fetch(`/api/videos/${id}`, { method: "DELETE" }).then(j);

export function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return fetch("/api/videos", { method: "POST", body: fd }).then(j);
}

export function subscribeEvents(onEvent) {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => { try { onEvent(JSON.parse(e.data)); } catch {} };
  return () => es.close();
}
