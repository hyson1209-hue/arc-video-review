// app.jsx — 셸: 사이드바 내비 · 라우터 · 토스트 · 전역 SSE
import { useEffect, useState } from "react";
import { fetchVideos, subscribeEvents } from "./api.js";
import { Icon } from "./ui.jsx";
import { Dashboard } from "./dashboard.jsx";
import { Upload } from "./upload.jsx";
import { Search } from "./search.jsx";
import { Report } from "./report.jsx";

function NavItem({ icon, label, active, badge, onClick }) {
  return (
    <button className={"nav__item" + (active ? " nav__item--active" : "")} onClick={onClick}>
      <Icon name={icon} size={17} />{label}
      {badge != null && badge !== 0 && <span className="nav__badge">{badge}</span>}
    </button>
  );
}

function Toast({ t, onClose }) {
  useEffect(() => { const id = setTimeout(onClose, 5200); return () => clearTimeout(id); }, []);
  if (t.deleted) {
    return (
      <div className="card fade" style={{ width: 320, boxShadow: "var(--shadow)", padding: "12px 14px",
        display: "flex", gap: 11, alignItems: "flex-start" }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--block-bg)", color: "var(--block)",
          display: "grid", placeItems: "center", flex: "none" }}><Icon name="trash" size={16} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>삭제 완료</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 1 }}>{t.title} · 관련 데이터 모두 제거됨</div>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ padding: 4 }}><Icon name="x" size={14} /></button>
      </div>
    );
  }
  return (
    <div className="card fade" style={{ width: 340, boxShadow: "var(--shadow)", padding: "13px 15px",
      display: "flex", gap: 12, alignItems: "flex-start" }}>
      <div style={{ width: 32, height: 32, borderRadius: 9, background: "oklch(0.6 0.13 230 / 0.14)", color: "oklch(0.5 0.13 235)",
        display: "grid", placeItems: "center", flex: "none" }}><Icon name="bell" size={17} /></div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>텔레그램 알림</span>
          <span className="muted" style={{ fontSize: 11 }}>· 방금</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--text-2)", marginTop: 2, lineHeight: 1.5 }}>
          <b style={{ color: "var(--text)" }}>{t.title}</b> 처리 완료.{" "}
          {t.err ? <span style={{ color: "var(--warn)" }}>일부 단계 실패(나머지 완료)</span> : "검수 결과 요약이 전송되었습니다."}
        </div>
      </div>
      <button className="btn btn--ghost btn--sm" onClick={onClose} style={{ padding: 4 }}><Icon name="x" size={14} /></button>
    </div>
  );
}

export function App() {
  const [route, setRoute] = useState(() => {
    try { return JSON.parse(localStorage.getItem("arc.route")) || { view: "dashboard" }; }
    catch { return { view: "dashboard" }; }
  });
  const [toasts, setToasts] = useState([]);
  const [processing, setProcessing] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => { try { localStorage.setItem("arc.route", JSON.stringify(route)); } catch {} }, [route]);

  function refreshProcessing() {
    fetchVideos().then(vs => setProcessing(vs.filter(v => v.status === "processing").length)).catch(() => {});
  }
  useEffect(refreshProcessing, []);

  // 전역 SSE: 완료 토스트 + 처리 중 배지 + 대시보드 갱신
  useEffect(() => subscribeEvents(ev => {
    if (ev.type === "video-done") {
      pushToast({ title: ev.title, err: (ev.failedStages || []).length > 0 });
      setRefreshKey(k => k + 1);
      refreshProcessing();
    } else if (ev.type === "stage" && ev.progress === 0) {
      refreshProcessing();
    }
  }), []);

  function onOpen(r) { setRoute(r); document.querySelector(".main")?.scrollTo(0, 0); }
  function pushToast(data) { const id = Math.random(); setToasts(p => [...p, { id, ...data }]); }
  function closeToast(id) { setToasts(p => p.filter(x => x.id !== id)); }

  const nav = [
    { view: "dashboard", icon: "grid",   label: "대시보드" },
    { view: "upload",    icon: "upload", label: "업로드 · 처리", badge: processing },
    { view: "search",    icon: "search", label: "검색" },
  ];

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav__brand">
          <div className="nav__logo">A</div>
          <div>
            <div className="nav__name">ARC</div>
            <div className="nav__sub">아카이브 검수 콘솔</div>
          </div>
        </div>
        <div className="nav__group">작업</div>
        {nav.map(n => (
          <NavItem key={n.view} icon={n.icon} label={n.label} badge={n.badge}
            active={route.view === n.view || (route.view === "report" && n.view === "dashboard")}
            onClick={() => onOpen({ view: n.view })} />
        ))}
        <div className="nav__group">심의 기준</div>
        <NavItem icon="doc" label="금칙기준.md" onClick={() => pushToast({ title: "rules/금칙기준.md — 수정 시 다음 영상부터 적용", err: false })} />
        <NavItem icon="doc" label="운영절차서.md" onClick={() => pushToast({ title: "server/docs/운영절차서.md", err: false })} />
        <div className="nav__spacer" />
        <div className="nav__foot">저장소 2종 병행 · <b>재시작 후 유지</b><br />키워드 색인 + 벡터 색인</div>
      </nav>

      <main className="main">
        {route.view === "dashboard" && <Dashboard onOpen={onOpen} refreshKey={refreshKey} />}
        {route.view === "upload" && <Upload onOpen={onOpen} />}
        {route.view === "search" && <Search onOpen={onOpen} />}
        {route.view === "report" && <Report id={route.id} onOpen={onOpen} pushToast={pushToast} />}
      </main>

      <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 80, display: "grid", gap: 10 }}>
        {toasts.map(x => <Toast key={x.id} t={x} onClose={() => closeToast(x.id)} />)}
      </div>
    </div>
  );
}
