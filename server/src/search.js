// server/src/search.js — 4모드 검색 (hybrid/keyword/vector/filter)
import { embed } from "./openai.js";

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// kw: [{video_id,t,content,scoreK}] · vec: [{video_id,t,text,scoreV}]
export function mergeResults(kw, vec, mode) {
  const key = (r) => `${r.video_id}@${Math.round(r.t / 5) * 5}`; // 5초 버킷으로 동일 장면 병합
  const map = new Map();
  for (const r of kw) map.set(key(r), { vid: r.video_id, t: r.t, text: r.content, scoreK: r.scoreK, scoreV: 0, source: "keyword" });
  for (const r of vec) {
    const k = key(r);
    if (map.has(k)) { const m = map.get(k); m.scoreV = r.scoreV; m.source = "both"; }
    else map.set(k, { vid: r.video_id, t: r.t, text: r.text, scoreK: 0, scoreV: r.scoreV, source: "vector" });
  }
  let out = [...map.values()];
  if (mode === "keyword") out = out.filter(r => r.source !== "vector").sort((a, b) => b.scoreK - a.scoreK);
  else if (mode === "vector") out = out.sort((a, b) => b.scoreV - a.scoreV);
  else out = out.sort((a, b) => (b.scoreK + b.scoreV) - (a.scoreK + a.scoreV));
  return out.slice(0, 12);
}

export async function search(db, q, mode) {
  // filter 모드: 제목·프로그램·업로드일 단순 조건 매칭 (PRD: 날짜·카테고리 등 조건)
  if (mode === "filter") {
    return db.listVideos()
      .filter(v => v.title.includes(q) || v.program.includes(q) || (v.uploaded_at || "").includes(q))
      .map(v => ({ vid: v.id, t: 0, text: `${v.program} · ${v.uploaded_at}`, scoreK: 1, scoreV: 0, source: "keyword",
        reason: `조건 일치: 제목/프로그램/업로드일에 '${q}' 포함` }));
  }
  const ftsQ = q.split(/\s+/).filter(Boolean).map(w => `"${w.replace(/"/g, "")}"`).join(" OR ");
  // FTS5 bm25 는 음수일수록 관련성이 높다 → 0~1 로 정규화
  const kw = (mode !== "vector" && ftsQ)
    ? db.searchKeyword(ftsQ).map(r => {
        const rel = Math.max(0, -r.rank);
        return { ...r, scoreK: rel / (1 + rel) || 0.5 };
      })
    : [];
  let vec = [];
  if (mode !== "keyword") {
    const [qv] = await embed([q]);
    vec = db.allEmbeddings().map(e => ({ ...e, scoreV: cosine(qv, e.vector) }))
      .sort((a, b) => b.scoreV - a.scoreV).slice(0, 20).filter(e => e.scoreV > 0.2);
  }
  const merged = mergeResults(kw, vec, mode);
  return merged.map(r => ({ ...r, reason: reasonOf(r, q) }));
}

function reasonOf(r, q) {
  if (r.source === "both") return `'${q}' 키워드 일치 + 의미 유사 (${r.scoreV.toFixed(2)})`;
  if (r.source === "keyword") return "자막/장면 설명에 키워드 직접 등장";
  return `직접 언급은 없으나 의미상 근접 (${r.scoreV.toFixed(2)})`;
}
