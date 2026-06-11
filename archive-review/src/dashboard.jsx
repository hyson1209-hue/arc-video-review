// dashboard.jsx — 대시보드 (영상 목록 + 상태/심각도) — API 실데이터
import { useEffect, useState } from "react";
import { tc } from "./data.js";
import { fetchVideos } from "./api.js";
import { Icon, SevBadge, Thumb } from "./ui.jsx";

function StatCard({ label, value, sub, tone }) {
  return (
    <div className="card" style={{ padding: "var(--card-pad)" }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span className="num-strong" style={{ fontSize: 27, color: tone || "var(--text)" }}>{value}</span>
        {sub && <span className="muted" style={{ fontSize: 12 }}>{sub}</span>}
      </div>
    </div>
  );
}

function CountPills({ counts }) {
  const order = [["block", "var(--block)"], ["warn", "var(--warn)"], ["caution", "var(--caution)"]];
  const has = order.some(([k]) => counts[k]);
  if (!has) return <span className="muted" style={{ fontSize: 12.5 }}>위반 없음</span>;
  return (
    <div style={{ display: "flex", gap: 6 }}>
      {order.map(([k, c]) => counts[k] ? (
        <span key={k} className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: c }} />{counts[k]}
        </span>
      ) : null)}
    </div>
  );
}

export function Dashboard({ onOpen, refreshKey }) {
  const [q, setQ] = useState("");
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let on = true;
    fetchVideos().then(v => { if (on) { setVideos(v); setLoading(false); } })
      .catch(() => on && setLoading(false));
    return () => { on = false; };
  }, [refreshKey]);

  const done = videos.filter(v => v.status === "done");
  const blocked = done.filter(v => v.worstScore >= 4).length;
  const review = done.filter(v => v.worstScore === 3).length;
  const totalDur = done.reduce((a, v) => a + (v.duration || 0), 0);

  const filtered = videos.filter(v =>
    !q || v.title.includes(q) || (v.program || "").includes(q) || (v.file || "").includes(q));

  return (
    <div className="view fade">
      <div className="pagehead">
        <div>
          <div className="eyebrow">검수 대시보드</div>
          <h1>아카이브 영상</h1>
          <p>업로드된 영상의 자동 분석·금칙 검수 결과를 한눈에 확인합니다.</p>
        </div>
        <button className="btn btn--primary" onClick={() => onOpen({ view: "upload" })}>
          <Icon name="upload" size={16} />영상 업로드
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gap)", marginBottom: "var(--gap)" }}>
        <StatCard label="총 영상" value={videos.length} sub={`· ${tc(totalDur)} 분량`} />
        <StatCard label="검수 완료" value={done.length} sub="/ 전체" />
        <StatCard label="방영 불가" value={blocked} tone="var(--block)" sub="건" />
        <StatCard label="경고 · 검토 필요" value={review} tone="var(--warn)" sub="건" />
      </div>

      <div className="card">
        <div className="card__h">
          <h3>영상 목록 <span className="sub" style={{ marginLeft: 6 }}>{filtered.length}건</span></h3>
          <div style={{ position: "relative", width: 260 }}>
            <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-3)" }}>
              <Icon name="search" size={15} />
            </span>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="제목·프로그램·파일명"
              style={{ width: "100%", padding: "7px 10px 7px 31px", border: "1px solid var(--border-2)",
                borderRadius: 7, font: "inherit", fontSize: 13, background: "var(--surface-2)", color: "var(--text)" }} />
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: "44px var(--card-pad)", textAlign: "center", color: "var(--text-3)" }}>
            {loading ? "불러오는 중…" : q ? "검색 결과가 없습니다." : (
              <>
                아직 업로드된 영상이 없습니다.
                <div style={{ marginTop: 12 }}>
                  <button className="btn btn--primary" onClick={() => onOpen({ view: "upload" })}>
                    <Icon name="upload" size={15} />첫 영상 업로드
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 92 }}>프레임</th>
                <th>영상</th>
                <th style={{ width: 110 }}>분류</th>
                <th style={{ width: 96 }}>길이</th>
                <th style={{ width: 130 }}>자막</th>
                <th style={{ width: 118 }}>위반</th>
                <th style={{ width: 110 }}>판정</th>
                <th style={{ width: 36 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id} onClick={() => v.status === "done" && onOpen({ view: "report", id: v.id })}
                  style={v.status !== "done" ? { cursor: "default" } : undefined}>
                  <td>
                    <Thumb t={null} style={{ width: 76 }} src={v.thumb}
                      sev={v.status === "done" ? v.worstScore : null} cat={v.topCategory} />
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{v.title}</div>
                    <div className="mono muted" style={{ fontSize: 11.5, marginTop: 2 }}>{v.file} · {v.size}</div>
                  </td>
                  <td><span className="chip">{v.program}</span></td>
                  <td className="mono" style={{ fontSize: 13 }}>{tc(v.duration || 0)}</td>
                  <td>
                    <span style={{ fontSize: 12.5, color: (v.captionSource || "").includes("음성") ? "var(--primary)" : "var(--text-2)" }}>
                      {v.captionSource || "—"}
                    </span>
                  </td>
                  <td><CountPills counts={v.counts} /></td>
                  <td>
                    {v.status === "processing" ? <span className="badge badge--neutral pulse">처리 중</span>
                      : v.status === "error" ? <span className="badge badge--caution"><span className="dot" />오류</span>
                      : <SevBadge score={v.worstScore} />}
                  </td>
                  <td style={{ color: "var(--text-3)" }}>{v.status === "done" && <Icon name="chevR" size={16} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
