// report.jsx — 검수 리포트 (타임라인 · 위반 그리드 · 분석정보 · 삭제) — API 실데이터
import { useEffect, useState } from "react";
import { CATEGORIES, severityOf, tc } from "./data.js";
import { deleteVideo, fetchReport } from "./api.js";
import { CatChip, Icon, SevBadge, Thumb } from "./ui.jsx";
import { AnalysisTabs, FlagModal } from "./report-info.jsx";

const TL_COLORS = {
  ok:        { c: "var(--pass)",    label: "정상" },
  silence:   { c: "var(--silence)", label: "무음" },
  review:    { c: "var(--review)",  label: "검토필요" },
  violation: { c: "var(--block)",   label: "위반" },
};

function Timeline({ report, onPick }) {
  const dur = report.meta.duration || 1;
  const ticks = 6;
  return (
    <div>
      <div style={{ position: "relative", height: 38, borderRadius: 7, overflow: "hidden",
        border: "1px solid var(--border)", background: "var(--pass-bg)" }}>
        {report.timeline.map((seg, i) => (
          <div key={i} title={TL_COLORS[seg.kind].label + " " + tc(seg.start) + "–" + tc(seg.end)}
            style={{ position: "absolute", top: 0, bottom: 0,
              left: (seg.start / dur * 100) + "%", width: ((seg.end - seg.start) / dur * 100) + "%",
              background: TL_COLORS[seg.kind].c, opacity: seg.kind === "ok" ? 0.5 : 1 }} />
        ))}
        {report.flags.map((f, i) => (
          <button key={i} onClick={() => onPick(f)} title={(CATEGORIES[f.cat]?.label || f.cat) + " " + tc(f.t)}
            style={{ position: "absolute", top: -1, bottom: -1, left: (f.t / dur * 100) + "%", width: 3,
              transform: "translateX(-1px)", background: "var(--text)", border: "none", cursor: "pointer", padding: 0 }} />
        ))}
      </div>
      <div style={{ position: "relative", height: 16, marginTop: 4 }}>
        {Array.from({ length: ticks + 1 }, (_, i) => (
          <span key={i} className="mono" style={{ position: "absolute", left: (i / ticks * 100) + "%",
            transform: i === 0 ? "none" : i === ticks ? "translateX(-100%)" : "translateX(-50%)",
            fontSize: 10.5, color: "var(--text-3)" }}>{tc(Math.round(dur * i / ticks))}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {Object.entries(TL_COLORS).map(([k, v]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)" }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: v.c, opacity: k === "ok" ? 0.5 : 1 }} />{v.label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: "var(--text-2)", marginLeft: "auto" }}>
          <span style={{ width: 3, height: 12, background: "var(--text)" }} />위반 프레임 위치
        </span>
      </div>
    </div>
  );
}

function VerdictBanner({ report }) {
  const flags = report.flags;
  const worst = flags.length ? Math.max(...flags.map(f => f.score)) : 0;
  const sev = severityOf(worst);
  const tally = { block: 0, warn: 0, caution: 0 };
  flags.forEach(f => { const k = severityOf(f.score).key; if (tally[k] != null) tally[k]++; });
  const tone = { block: "var(--block)", warn: "var(--warn)", caution: "var(--caution)", pass: "var(--pass)" }[sev.key];
  const toneBg = { block: "var(--block-bg)", warn: "var(--warn-bg)", caution: "var(--caution-bg)", pass: "var(--pass-bg)" }[sev.key];
  return (
    <div className="card" style={{ padding: "var(--card-pad)", borderLeft: "4px solid " + tone,
      display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, background: toneBg, color: tone,
          display: "grid", placeItems: "center", flex: "none" }}>
          <Icon name={worst >= 1 ? "alert" : "check"} size={24} />
        </div>
        <div>
          <div className="eyebrow">종합 판정</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: tone, letterSpacing: "-0.02em" }}>{sev.label}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 26, marginLeft: "auto", flexWrap: "wrap" }}>
        {[["방영 불가", tally.block, "var(--block)"], ["경고", tally.warn, "var(--warn)"], ["주의", tally.caution, "var(--caution)"]].map(([l, n, c]) => (
          <div key={l} style={{ textAlign: "center" }}>
            <div className="num-strong" style={{ fontSize: 24, color: n ? c : "var(--text-3)" }}>{n}</div>
            <div className="muted" style={{ fontSize: 11.5 }}>{l}</div>
          </div>
        ))}
        <div style={{ textAlign: "center", paddingLeft: 26, borderLeft: "1px solid var(--border)" }}>
          <div className="num-strong" style={{ fontSize: 24 }}>{flags.length}</div>
          <div className="muted" style={{ fontSize: 11.5 }}>총 플래그</div>
        </div>
      </div>
    </div>
  );
}

function FlagCard({ f, onClick }) {
  return (
    <div className="card fade" style={{ overflow: "hidden", cursor: "pointer" }} onClick={onClick}>
      <Thumb t={f.t} sev={f.score} cat={f.cat} src={f.frames?.[0]} play />
      <div style={{ padding: "10px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <CatChip cat={f.cat} />
          <SevBadge score={f.score} withDot={false} />
        </div>
        <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8, lineHeight: 1.45,
          display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.desc}</div>
        <div className="mono muted" style={{ fontSize: 10.5, marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
          <Icon name="layers" size={12} />{f.basis}
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ title, busy, error, onCancel, onConfirm }) {
  return (
    <div onClick={onCancel} style={{ position: "fixed", inset: 0, background: "oklch(0.2 0.02 262 / 0.45)",
      zIndex: 70, display: "grid", placeItems: "center", padding: 24, animation: "fadeUp 0.2s ease both" }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: "min(440px, 100%)", boxShadow: "var(--shadow)" }}>
        <div className="card__b">
          <div style={{ display: "flex", gap: 13 }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: "var(--block-bg)", color: "var(--block)",
              display: "grid", placeItems: "center", flex: "none" }}><Icon name="trash" size={20} /></div>
            <div>
              <h3 style={{ margin: "2px 0 6px", fontSize: 15.5 }}>영상을 삭제할까요?</h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-2)", lineHeight: 1.55 }}>
                <b>{title}</b> 의 원본과 함께 <b>리포트·검색 색인·프레임 이미지</b>가 모두 영구 삭제됩니다. 되돌릴 수 없습니다.
              </p>
              {error && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--block)" }}>{error}</p>}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px var(--card-pad)", borderTop: "1px solid var(--border)", background: "var(--surface-2)",
          borderRadius: "0 0 var(--radius) var(--radius)", display: "flex", justifyContent: "flex-end", gap: 9 }}>
          <button className="btn btn--sm" onClick={onCancel}>취소</button>
          <button className="btn btn--sm btn--danger" disabled={busy} onClick={onConfirm}>
            <Icon name="trash" size={14} />{busy ? "삭제 중…" : "영구 삭제"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Report({ id, onOpen, pushToast }) {
  const [report, setReport] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [flag, setFlag] = useState(null);
  const [del, setDel] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [delError, setDelError] = useState(null);
  const [catFilter, setCatFilter] = useState("전체");

  useEffect(() => {
    let on = true;
    setReport(null); setLoadError(null);
    fetchReport(id).then(r => on && setReport(r)).catch(e => on && setLoadError(String(e.message || e)));
    return () => { on = false; };
  }, [id]);

  async function confirmDelete() {
    setDelBusy(true); setDelError(null);
    try {
      await deleteVideo(id);
      setDel(false);
      pushToast({ title: report.meta.title, deleted: true });
      onOpen({ view: "dashboard" });
    } catch (e) { setDelError(String(e.message || e)); }
    finally { setDelBusy(false); }
  }

  if (loadError) return (
    <div className="view fade">
      <div className="card" style={{ padding: "var(--card-pad)", color: "var(--block)" }}>리포트를 불러올 수 없습니다: {loadError}</div>
    </div>
  );
  if (!report) return <div className="view fade"><div className="muted" style={{ padding: 30 }}>리포트 불러오는 중…</div></div>;

  const cats = ["전체", ...Array.from(new Set(report.flags.map(f => f.cat)))];
  const flags = catFilter === "전체" ? report.flags : report.flags.filter(f => f.cat === catFilter);

  return (
    <div className="view fade">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <button className="btn btn--ghost btn--sm" onClick={() => onOpen({ view: "dashboard" })}>
          <Icon name="grid" size={14} />대시보드
        </button>
        <Icon name="chevR" size={14} className="muted" />
        <span className="muted" style={{ fontSize: 12.5 }}>검수 리포트</span>
      </div>

      <div className="pagehead" style={{ paddingTop: 0 }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: 10 }}>{report.meta.title}</h1>
          <p className="mono" style={{ fontSize: 12 }}>{report.meta.file} · {report.meta.size} · {tc(report.meta.duration)}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <a className="btn" href={`/api/videos/${id}/report.json`} download><Icon name="download" size={15} />report.json</a>
          <a className="btn" href={`/api/videos/${id}/violations.csv`} download><Icon name="download" size={15} />violations.csv</a>
          <button className="btn btn--danger" onClick={() => setDel(true)}><Icon name="trash" size={15} />삭제</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: "var(--gap)" }}>
        <VerdictBanner report={report} />

        <div className="card">
          <div className="card__h"><h3>영상 타임라인</h3><span className="sub">구간별 분석 결과</span></div>
          <div className="card__b"><Timeline report={report} onPick={setFlag} /></div>
        </div>

        <div className="card">
          <div className="card__h">
            <h3>위반 · 검토필요 프레임 <span className="sub" style={{ marginLeft: 6 }}>{flags.length}</span></h3>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {cats.map(c => (
                <button key={c} onClick={() => setCatFilter(c)} className="btn btn--sm" style={{
                  background: catFilter === c ? "var(--primary-soft)" : "var(--surface)",
                  borderColor: catFilter === c ? "var(--primary)" : "var(--border)",
                  color: catFilter === c ? "var(--primary-700)" : "var(--text-2)", padding: "4px 9px" }}>
                  {c === "전체" ? "전체" : <CatChip cat={c} />}
                </button>
              ))}
            </div>
          </div>
          <div className="card__b">
            {flags.length === 0
              ? <p className="muted" style={{ margin: 0 }}>위반·검토필요 프레임이 없습니다 — 통과.</p>
              : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(208px, 1fr))", gap: "var(--gap)" }}>
                  {flags.map((f, i) => <FlagCard key={i} f={f} onClick={() => setFlag(f)} />)}
                </div>}
          </div>
        </div>

        <AnalysisTabs report={report} />
      </div>

      <FlagModal flag={flag} onClose={() => setFlag(null)} />
      {del && <DeleteModal title={report.meta.title} busy={delBusy} error={delError}
        onCancel={() => { setDel(false); setDelError(null); }} onConfirm={confirmDelete} />}
    </div>
  );
}
