// ui.jsx — 공유 컴포넌트: 아이콘, 배지, 카테고리 칩, 프레임 썸네일
import { CATEGORIES, severityOf, tc } from "./data.js";

// 라인 아이콘 세트 (단순 stroke)
export function Icon({ name, size = 18, className = "" }) {
  const p = {
    grid:   "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
    upload: "M12 16V4M7 9l5-5 5 5M5 20h14",
    search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
    video:  "M4 5h11v14H4zM15 9l5-3v12l-5-3",
    bell:   "M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6M10 21a2 2 0 0 0 4 0",
    trash:  "M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14",
    play:   "M8 5v14l11-7z",
    clock:  "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
    alert:  "M12 3l9 16H3zM12 10v4M12 17h.01",
    check:  "M5 12l5 5L20 7",
    x:      "M6 6l12 12M18 6L6 18",
    chevR:  "M9 6l6 6-6 6",
    chevD:  "M6 9l6 6 6-6",
    spark:  "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2",
    layers: "M12 3l9 5-9 5-9-5zM3 13l9 5 9-5",
    wave:   "M3 12h2l2-6 3 12 3-9 2 5 2-2h4",
    doc:    "M6 3h8l4 4v14H6zM14 3v4h4",
    filter: "M3 5h18l-7 8v6l-4-2v-4z",
    download:"M12 4v10M8 11l4 4 4-4M5 20h14",
    eye:    "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    scissor:"M6 6a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM6 18a2 2 0 1 0 4 0 2 2 0 0 0-4 0zM8.5 8.5L20 18M8.5 15.5L20 6",
  }[name];
  return (
    <svg className={"ico " + className} width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d={p} />
    </svg>
  );
}

// 카테고리 색 (8종, 같은 채도/명도 · 색상만 변주)
export const CAT_COLORS = {
  성표현:   "oklch(0.62 0.16 350)",
  폭력:     "oklch(0.6 0.18 26)",
  충격혐오: "oklch(0.55 0.13 300)",
  유해행위: "oklch(0.6 0.14 145)",
  인격권:   "oklch(0.58 0.13 250)",
  차별증오: "oklch(0.55 0.15 20)",
  아동청소년: "oklch(0.6 0.13 200)",
  광고저작권: "oklch(0.62 0.1 90)",
};

export function CatChip({ cat, withLabel = true }) {
  const c = CATEGORIES[cat];
  if (!c) return null;
  return (
    <span className="chip">
      <span className="cat-sq" style={{ background: CAT_COLORS[cat], width: 15, height: 15, fontSize: 9.5 }}>{c.short}</span>
      {withLabel && c.label}
    </span>
  );
}

export function CatSquare({ cat, size = 17 }) {
  const c = CATEGORIES[cat];
  if (!c) return null;
  return <span className="cat-sq" style={{ background: CAT_COLORS[cat], width: size, height: size }}>{c.short}</span>;
}

// 심각도 배지
export function SevBadge({ score, withDot = true }) {
  const s = severityOf(score);
  return (
    <span className={"badge badge--" + s.key}>
      {withDot && <span className="dot" />}{s.label}
    </span>
  );
}

// 영상 프레임 썸네일 (플레이스홀더 — 실제 프레임 자리)
export function Thumb({ t, sev, cat, play, style }) {
  const sevColor = sev != null
    ? { pass: "var(--pass)", caution: "var(--caution)", warn: "var(--warn)", block: "var(--block)" }[severityOf(sev).key]
    : null;
  return (
    <div className="thumb" style={style}>
      {cat && <span className="thumb__tag"><CatSquare cat={cat} size={16} /></span>}
      {play && <span className="thumb__play"><Icon name="play" size={26} /></span>}
      {t != null && <span className="thumb__tc">{tc(t)}</span>}
      {sevColor && <span className="thumb__sev" style={{ background: sevColor }} />}
    </div>
  );
}
