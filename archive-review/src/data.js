// data.js — 클라이언트 상수 (목 데이터는 API 로 대체됨)

// 심의 카테고리 8종 (방송심의에 관한 규정 기준)
export const CATEGORIES = {
  성표현:   { label: "성표현",   short: "성" },
  폭력:     { label: "폭력",     short: "폭" },
  충격혐오: { label: "충격혐오", short: "혐" },
  유해행위: { label: "유해행위", short: "유" },
  인격권:   { label: "인격권",   short: "인" },
  차별증오: { label: "차별증오", short: "차" },
  아동청소년: { label: "아동청소년", short: "아" },
  광고저작권: { label: "광고저작권", short: "광" },
};

// 심각도 등급
// 0 통과 · 1~2 주의 · 3 경고(검토필요) · 4~5 방영불가
export function severityOf(score) {
  if (score >= 4) return { key: "block",   label: "방영 불가", short: "불가" };
  if (score === 3) return { key: "warn",   label: "경고",     short: "경고" };
  if (score >= 1) return { key: "caution", label: "주의",     short: "주의" };
  return { key: "pass", label: "통과", short: "통과" };
}

export const SEARCH_MODES = [
  { key: "hybrid",  label: "hybrid",  desc: "키워드 + 의미 점수 합산", note: "기본값" },
  { key: "keyword", label: "keyword", desc: "정확한 단어 매칭" },
  { key: "vector",  label: "vector",  desc: "의미가 비슷한 내용" },
  { key: "filter",  label: "filter",  desc: "날짜·카테고리 등 조건" },
];

// 처리 단계 (서버 파이프라인 키와 1:1)
export const STAGE_DEFS = [
  { key: "extract", label: "자막 추출",        group: "언어" },
  { key: "correct", label: "자막 교정",        group: "언어" },
  { key: "scene",   label: "장면 분석",        group: "분석" },
  { key: "tech",    label: "기술 검토",        group: "분석" },
  { key: "index",   label: "색인 생성",        group: "분석" },
  { key: "sample",  label: "프레임 샘플링",    group: "검수" },
  { key: "judge",   label: "프레임 금칙 판정", group: "검수" },
  { key: "verdict", label: "종합 판정",        group: "검수" },
];
export const STAGE_GROUPS = ["언어", "분석", "검수"];

// 시:분:초 포맷
export function tc(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
