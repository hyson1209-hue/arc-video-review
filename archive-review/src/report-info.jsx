// report-info.jsx — 리포트 분석 정보 탭 + 위반 프레임 상세 모달 (API 실데이터)
import { useState } from "react";
import { CATEGORIES, tc } from "./data.js";
import { CatSquare, Icon, SevBadge, Thumb } from "./ui.jsx";

// ── 분석 정보 탭 ───────────────────────────────
export function AnalysisTabs({ report }) {
  const tabs = ["메타데이터", "기술 검토", "장면 분석", "자막 교정", "자막 전문"];
  const [tab, setTab] = useState("메타데이터");
  const m = report.meta;

  return (
    <div className="card">
      <div className="card__h" style={{ padding: 0, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        <div style={{ display: "flex" }}>
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: "13px 16px", border: "none", background: "none", font: "inherit", cursor: "pointer",
              fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
              color: tab === t ? "var(--text)" : "var(--text-3)",
              borderBottom: "2px solid " + (tab === t ? "var(--primary)" : "transparent"),
              marginBottom: -1 }}>{t}
              {t === "자막 교정" && <span className="badge badge--neutral" style={{ marginLeft: 6, fontSize: 10, padding: "0 6px" }}>{report.corrections.length}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="card__b">
        {tab === "메타데이터" && (
          <dl className="kv" style={{ gridTemplateColumns: "max-content 1fr max-content 1fr", maxWidth: 760 }}>
            <dt>파일명</dt><dd className="mono" style={{ fontSize: 12.5 }}>{m.file}</dd>
            <dt>크기</dt><dd>{m.size}</dd>
            <dt>길이</dt><dd className="mono">{tc(m.duration)}</dd>
            <dt>해상도</dt><dd className="mono" style={{ fontSize: 12.5 }}>{m.resolution || "—"}</dd>
            <dt>업로드</dt><dd className="mono" style={{ fontSize: 12.5 }}>{m.uploadedAt}</dd>
            <dt>처리 완료</dt><dd className="mono" style={{ fontSize: 12.5 }}>{m.processedAt || "—"}</dd>
            <dt>자막 출처</dt><dd style={{ gridColumn: "2 / -1" }}>{m.captionSource || "—"}</dd>
          </dl>
        )}
        {tab === "기술 검토" && (
          report.tech.length === 0
            ? <p className="muted" style={{ margin: 0 }}>감지된 무음·블랙·프리즈 구간이 없습니다.</p>
            : <table className="tbl">
                <thead><tr><th style={{ width: 110 }}>유형</th><th style={{ width: 170 }}>구간</th><th>비고</th></tr></thead>
                <tbody>
                  {report.tech.map((x, i) => (
                    <tr key={i} style={{ cursor: "default" }}>
                      <td><span className="chip">{x.kind}</span></td>
                      <td className="mono" style={{ fontSize: 13 }}>{x.range}</td>
                      <td className="muted">{x.note || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
        )}
        {tab === "장면 분석" && (
          report.scenes.length === 0
            ? <p className="muted" style={{ margin: 0 }}>장면 분석 결과가 없습니다 (단계 실패 또는 생략).</p>
            : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "var(--gap)" }}>
                {report.scenes.map((s, i) => (
                  <div key={i}>
                    <Thumb t={s.t} src={s.frame} play />
                    <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 7, lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                ))}
              </div>
        )}
        {tab === "자막 교정" && (
          <div style={{ display: "grid", gap: 10 }}>
            <p className="muted" style={{ margin: "0 0 4px", fontSize: 12.5 }}>AI가 교정한 문장만 표시합니다 — 원본 → 교정.</p>
            {report.corrections.length === 0 && <p className="muted" style={{ margin: 0 }}>교정된 문장이 없습니다.</p>}
            {report.corrections.map((c, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "62px 1fr", gap: 12, alignItems: "center",
                padding: "11px 14px", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8 }}>
                <span className="mono chip" style={{ fontSize: 11 }}>{tc(c.t)}</span>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: "var(--text-3)", textDecoration: "line-through" }}>{c.before}</span>
                  <Icon name="chevR" size={14} className="muted" />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{c.after}</span>
                </div>
              </div>
            ))}
          </div>
        )}
        {tab === "자막 전문" && (
          report.captions.length === 0
            ? <p className="muted" style={{ margin: 0 }}>자막이 없습니다.</p>
            : <div style={{ maxHeight: 320, overflowY: "auto", display: "grid", gap: 2, paddingRight: 4 }}>
                {report.captions.map((c, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "60px 1fr", gap: 12,
                    padding: "7px 4px", borderBottom: "1px solid var(--border)" }}>
                    <span className="mono" style={{ fontSize: 12, color: "var(--text-3)" }}>{tc(c.t)}</span>
                    <span style={{ fontSize: 13.5 }}>{c.text}</span>
                  </div>
                ))}
              </div>
        )}
      </div>
    </div>
  );
}

// ── 위반 프레임 상세 모달 ───────────────────────────────
export function FlagModal({ flag, onClose }) {
  if (!flag) return null;
  const frames = flag.frames?.length ? flag.frames : [null];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "oklch(0.2 0.02 262 / 0.45)",
      zIndex: 60, display: "grid", placeItems: "center", padding: 24, animation: "fadeUp 0.2s ease both" }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: "min(560px, 100%)", boxShadow: "var(--shadow)" }}>
        <div className="card__h">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <CatSquare cat={flag.cat} size={22} />
            <div>
              <h3>{CATEGORIES[flag.cat]?.label || flag.cat} · {tc(flag.t)}</h3>
              <div className="muted" style={{ fontSize: 11.5 }}>판정 근거 · {flag.basis}</div>
            </div>
          </div>
          <button className="btn btn--ghost btn--sm" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>
        <div className="card__b">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <SevBadge score={flag.score} />
            <span className="mono muted" style={{ fontSize: 12 }}>심각도 {flag.score} / 5</span>
            {flag.audio && flag.audio !== "—" && <span className="chip" style={{ marginLeft: "auto" }}><Icon name="wave" size={13} />{flag.audio}</span>}
          </div>
          <div className="eyebrow" style={{ marginBottom: 8 }}>연속 묶음 판정 — {flag.group || frames.length}장</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {frames.map((src, i) => <Thumb key={i} t={flag.t + i} src={src} style={{ flex: 1 }} sev={flag.score} />)}
          </div>
          <div className="eyebrow" style={{ marginBottom: 6 }}>판정 내용</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: "var(--text)" }}>{flag.desc}</p>
        </div>
        <div style={{ padding: "12px var(--card-pad)", borderTop: "1px solid var(--border)", background: "var(--surface-2)",
          borderRadius: "0 0 var(--radius) var(--radius)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 11.5 }}>경계 사례는 <b style={{ color: "var(--warn)" }}>검토필요</b>로 분류되어 사람이 최종 확인합니다.</span>
          <button className="btn btn--sm" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
