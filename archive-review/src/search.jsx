// search.jsx — 자연어 검색 (4모드 + 썸네일·출처·이유) — API 실데이터
import { useEffect, useState } from "react";
import { SEARCH_MODES, tc } from "./data.js";
import { searchApi } from "./api.js";
import { Icon, Thumb } from "./ui.jsx";

const SOURCE_META = {
  keyword: { label: "keyword", color: "oklch(0.6 0.13 70)",  bg: "oklch(0.96 0.04 80)" },
  vector:  { label: "vector",  color: "oklch(0.55 0.13 285)", bg: "oklch(0.955 0.03 290)" },
  both:    { label: "both",    color: "oklch(0.5 0.12 158)",  bg: "oklch(0.95 0.04 158)" },
};

function SourceTag({ source }) {
  const m = SOURCE_META[source] || SOURCE_META.keyword;
  return <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: m.color, background: m.bg,
    padding: "2px 8px", borderRadius: 5, letterSpacing: "-0.01em" }}>{m.label}</span>;
}

function ScoreBar({ label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
      <span className="mono muted" style={{ fontSize: 10.5, width: 16 }}>{label}</span>
      <div className="bar" style={{ width: 56, height: 4 }}>
        <div className="bar__fill" style={{ width: Math.min(100, value * 100) + "%", background: "var(--text-3)" }} />
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: "var(--text-2)" }}>{value.toFixed(2)}</span>
    </div>
  );
}

function ResultRow({ r, mode, onOpen }) {
  return (
    <div className="card fade" style={{ padding: "var(--card-pad)", display: "grid",
      gridTemplateColumns: "168px 1fr", gap: 16, cursor: "pointer", alignItems: "start" }}
      onClick={() => onOpen({ view: "report", id: r.vid })}>
      <Thumb t={r.t} style={{ width: 168 }} src={r.frame} play />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: 14.5 }}>{r.video}</span>
          <span className="mono chip" style={{ fontSize: 11 }}>{tc(r.t)}</span>
          <SourceTag source={r.source} />
        </div>
        <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 7, lineHeight: 1.5 }}>{r.scene}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 9, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--text-3)" }}>이유</span>
          <span style={{ fontSize: 12.5, color: "var(--text)" }}>{r.reason}</span>
        </div>
        {mode !== "filter" && (
          <div style={{ display: "flex", gap: 16, marginTop: 11 }}>
            <ScoreBar label="kw" value={r.scoreK || 0} />
            <ScoreBar label="vec" value={r.scoreV || 0} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Search({ onOpen }) {
  const [mode, setMode] = useState("hybrid");
  const [q, setQ] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!submitted.trim()) { setResults([]); return; }
    let on = true;
    setBusy(true); setError(null);
    searchApi(submitted, mode)
      .then(r => on && setResults(r))
      .catch(e => on && setError(String(e.message || e)))
      .finally(() => on && setBusy(false));
    return () => { on = false; };
  }, [submitted, mode]);

  return (
    <div className="view fade">
      <div className="pagehead">
        <div>
          <div className="eyebrow">검색</div>
          <h1>자연어 영상 검색</h1>
          <p>장면 설명·자막·색인을 가로질러 자연어로 검색합니다. 결과마다 장면·출처·이유를 함께 표시합니다.</p>
        </div>
      </div>

      <div className="card" style={{ padding: "var(--card-pad)", marginBottom: "var(--gap)" }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 260 }}>
            <span style={{ position: "absolute", left: 13, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }}>
              <Icon name="search" size={17} />
            </span>
            <input value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && setSubmitted(q)}
              placeholder="예: 한강에서 촬영한 야간 장면"
              style={{ width: "100%", padding: "11px 13px 11px 40px", border: "1px solid var(--border-2)",
                borderRadius: 8, font: "inherit", fontSize: 14.5, background: "var(--surface-2)", color: "var(--text)" }} />
          </div>
          <button className="btn btn--primary" onClick={() => setSubmitted(q)} style={{ padding: "11px 18px" }}>
            {busy ? "검색 중…" : "검색"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 14, flexWrap: "wrap" }}>
          {SEARCH_MODES.map(m => (
            <button key={m.key} onClick={() => setMode(m.key)}
              className="btn btn--sm" style={{
                background: mode === m.key ? "var(--primary-soft)" : "var(--surface)",
                borderColor: mode === m.key ? "var(--primary)" : "var(--border)",
                color: mode === m.key ? "var(--primary-700)" : "var(--text-2)" }}>
              <span className="mono" style={{ fontWeight: 700 }}>{m.label}</span>
              <span style={{ fontWeight: 400, fontSize: 11.5, opacity: 0.85 }}>{m.desc}</span>
              {m.note && <span className="badge badge--neutral" style={{ fontSize: 10, padding: "0px 6px" }}>{m.note}</span>}
            </button>
          ))}
        </div>
      </div>

      {submitted && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 12px" }}>
          <span style={{ fontSize: 13 }}>“<b>{submitted}</b>” 검색 결과 <span className="muted">· {results.length}건</span></span>
          <span className="mono badge badge--neutral" style={{ marginLeft: "auto" }}>mode: {mode}</span>
        </div>
      )}

      {error && <div className="card" style={{ padding: "var(--card-pad)", color: "var(--block)" }}>검색 실패: {error}</div>}
      {!error && submitted && !busy && results.length === 0 && (
        <div className="card" style={{ padding: "28px var(--card-pad)", textAlign: "center", color: "var(--text-3)" }}>
          결과가 없습니다 — 다른 키워드나 모드를 시도해 보세요.
        </div>
      )}

      <div style={{ display: "grid", gap: "var(--gap)" }}>
        {results.map((r, i) => <ResultRow key={i} r={r} mode={mode} onOpen={onOpen} />)}
      </div>
    </div>
  );
}
