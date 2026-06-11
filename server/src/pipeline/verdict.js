// server/src/pipeline/verdict.js — 종합 판정 집계 · 타임라인 구성 · CSV
export function sevKey(score) {
  return score >= 4 ? "block" : score === 3 ? "warn" : score >= 1 ? "caution" : "pass";
}
const SEV_LABEL = { block: "방영불가", warn: "경고", caution: "주의", pass: "통과" };

export function aggregate(flags) {
  const counts = { block: 0, warn: 0, caution: 0 };
  let worst = 0, top = null;
  for (const f of flags) {
    const k = sevKey(f.score);
    if (counts[k] != null) counts[k]++;
    if (f.score > worst) { worst = f.score; top = f.cat; }
  }
  return { worstScore: worst, counts, topCategory: top };
}

// duration 전체를 ok 로 깔고, 무음→검토필요→위반 순으로 덮어쓴다 (나중 것이 우선)
export function buildTimeline(duration, flags, techFindings, sampleInterval) {
  const marks = new Array(Math.max(1, Math.ceil(duration)));
  marks.fill("ok");
  const paint = (s, e, kind) => {
    for (let i = Math.max(0, Math.floor(s)); i < Math.min(marks.length, Math.ceil(e)); i++) marks[i] = kind;
  };
  for (const t of techFindings) if (t.kind === "무음") paint(t.start, t.end, "silence");
  for (const f of flags) if (f.score === 3) paint(f.t, f.t + (f.groupN || 1) * sampleInterval, "review");
  for (const f of flags) if (f.score >= 4) paint(f.t, f.t + (f.groupN || 1) * sampleInterval, "violation");
  const segs = [];
  for (let i = 0; i < marks.length; i++) {
    if (!segs.length || segs.at(-1).kind !== marks[i]) segs.push({ start: i, end: i + 1, kind: marks[i] });
    else segs.at(-1).end = i + 1;
  }
  if (segs.length) segs.at(-1).end = duration;
  return segs;
}

export function toCsv(flags) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["t,category,score,severity,desc"];
  for (const f of flags) lines.push(`${f.t},${f.cat},${f.score},${SEV_LABEL[sevKey(f.score)]},${esc(f.desc)}`);
  return lines.join("\n");
}
