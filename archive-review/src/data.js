// data.js — 방송 아카이브 검수 콘솔 목 데이터 (사실적·절제)

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

// ── 영상 목록 ────────────────────────────────────────────────
export const VIDEOS = [
  {
    id: "v-2041",
    title: "도시의 밤 — 12회",
    program: "드라마",
    file: "citynight_ep12_master.mxf",
    size: "8.4 GB",
    duration: 2732,            // 45:32
    uploadedAt: "2026-06-11 09:14",
    status: "done",
    captionSource: "내장 자막",
    worstScore: 4,
    counts: { block: 2, warn: 1, caution: 3 },
    topCategory: "폭력",
  },
  {
    id: "v-2040",
    title: "탐사보도 추적 — 23회",
    program: "시사교양",
    file: "tracking_ep23_review.mov",
    size: "5.1 GB",
    duration: 2895,            // 48:15
    uploadedAt: "2026-06-11 08:50",
    status: "done",
    captionSource: "내장 자막",
    worstScore: 3,
    counts: { block: 0, warn: 1, caution: 2 },
    topCategory: "인격권",
  },
  {
    id: "v-2039",
    title: "주말의 발견 — 8회",
    program: "예능",
    file: "weekend_ep08.mp4",
    size: "6.7 GB",
    duration: 3730,            // 62:10
    uploadedAt: "2026-06-11 08:22",
    status: "done",
    captionSource: "음성 인식 생성",
    worstScore: 2,
    counts: { block: 0, warn: 0, caution: 4 },
    topCategory: "광고저작권",
  },
  {
    id: "v-2038",
    title: "여름 신상품 — 30초",
    program: "광고",
    file: "summer_promo_30s.mp4",
    size: "412 MB",
    duration: 30,
    uploadedAt: "2026-06-11 07:58",
    status: "done",
    captionSource: "음성 인식 생성",
    worstScore: 1,
    counts: { block: 0, warn: 0, caution: 1 },
    topCategory: "광고저작권",
  },
  {
    id: "v-2037",
    title: "한강의 사계 — 본편",
    program: "다큐멘터리",
    file: "hangang_doc_master.mxf",
    size: "9.2 GB",
    duration: 3108,            // 51:48
    uploadedAt: "2026-06-10 19:41",
    status: "done",
    captionSource: "내장 자막",
    worstScore: 0,
    counts: { block: 0, warn: 0, caution: 0 },
    topCategory: null,
  },
  {
    id: "v-2036",
    title: "뉴스특보 — 집중호우",
    program: "보도",
    file: "newsbreak_0610.mov",
    size: "1.3 GB",
    duration: 504,             // 08:24
    uploadedAt: "2026-06-10 18:03",
    status: "done",
    captionSource: "내장 자막",
    worstScore: 0,
    counts: { block: 0, warn: 0, caution: 0 },
    topCategory: null,
  },
];

// 리포트 상세 (도시의 밤 12회 기준 — 대표 케이스)
export const REPORT = {
  id: "v-2041",
  meta: {
    title: "도시의 밤 — 12회",
    file: "citynight_ep12_master.mxf",
    size: "8.4 GB",
    duration: 2732,
    resolution: "1920×1080 · 23.976fps",
    uploadedAt: "2026-06-11 09:14",
    processedAt: "2026-06-11 09:31",
    captionSource: "내장 자막 (트랙 #2, 한국어)",
  },
  // 타임라인 구간 (start,end 초 · kind)
  timeline: [
    { start: 0,    end: 180,  kind: "ok" },
    { start: 180,  end: 192,  kind: "silence" },
    { start: 192,  end: 612,  kind: "ok" },
    { start: 612,  end: 631,  kind: "violation" },   // 폭력
    { start: 631,  end: 980,  kind: "ok" },
    { start: 980,  end: 998,  kind: "review" },       // 검토필요
    { start: 998,  end: 1560, kind: "ok" },
    { start: 1560, end: 1576, kind: "violation" },    // 폭력
    { start: 1576, end: 2040, kind: "ok" },
    { start: 2040, end: 2052, kind: "review" },       // 인격권
    { start: 2052, end: 2188, kind: "ok" },
    { start: 2188, end: 2196, kind: "silence" },
    { start: 2196, end: 2732, kind: "ok" },
  ],
  // 위반 / 검토필요 프레임
  flags: [
    { t: 614,  cat: "폭력",   score: 4, group: 3,
      desc: "인물 간 몸싸움 — 머리채를 잡아 끄는 동작이 연속 프레임에서 확인됨",
      audio: "비명·고성 동반", basis: "연속 3장 · 대사·소리" },
    { t: 625,  cat: "폭력",   score: 3, group: 2,
      desc: "뺨 때리기 동작 (약 1.2초 구간) — 단일 정지화면으로는 판단이 어려워 연속 묶음으로 확정",
      audio: "타격음 감지", basis: "연속 2장 · 소리" },
    { t: 984,  cat: "성표현", score: 4, group: 2,
      desc: "의도적 탈의 — 성적 어필 맥락. 기준 개정(의도적 탈의=4) 반영으로 ‘방영 불가’ 상향",
      audio: "—", basis: "연속 2장 · 장면 맥락" },
    { t: 1564, cat: "폭력",   score: 2, group: 2,
      desc: "어깨를 밀치는 동작 — 경미하나 반복성 있어 주의로 분류",
      audio: "—", basis: "연속 2장" },
    { t: 2044, cat: "인격권", score: 2, group: 1,
      desc: "특정 인물을 향한 비하성 발언 — 자막·음성 근거",
      audio: "대사 근거", basis: "대사·소리" },
    { t: 420,  cat: "광고저작권", score: 1, group: 1,
      desc: "배경에 상표 노출 — 노출 시간 짧고 비의도적",
      audio: "—", basis: "단일 프레임" },
  ],
  // 기술 검토
  tech: [
    { kind: "무음",   range: "03:00 – 03:12", note: "장면 전환 정적" },
    { kind: "무음",   range: "36:36 – 36:48", note: "엔딩 직전 정적" },
    { kind: "블랙",   range: "00:00 – 00:04", note: "오프닝 페이드인" },
    { kind: "프리즈", range: "21:48 – 21:50", note: "프레임 정지 2초 (소스 결함 의심)" },
  ],
  // 장면 분석 (검색 색인용 설명)
  scenes: [
    { t: 42,   desc: "야간 도심 옥상, 두 인물이 마주 서 대화. 네온 간판 반사." },
    { t: 612,  desc: "실내 거실, 인물 간 격한 몸싸움. 카메라 핸드헬드 흔들림." },
    { t: 1248, desc: "비 내리는 골목, 우산 쓴 인물 단독 보행. 저조도." },
    { t: 2196, desc: "병원 복도, 인물 등을 보이며 퇴장. 정적인 롱테이크." },
  ],
  // 자막 교정 내역 (바뀐 문장만)
  corrections: [
    { t: 318,  before: "그 회사가 우리를 보케 했어", after: "그 회사가 우리를 모케(모함) 했어" },
    { t: 902,  before: "어차피 다 끄낸 일이야",       after: "어차피 다 끝난 일이야" },
    { t: 1510, before: "저 사람 이름이 민서기였나",   after: "저 사람 이름이 민석이였나" },
  ],
  // 자막 전문 (발췌)
  captions: [
    { t: 38,   text: "여기까지 올라온 이유가 뭐야." },
    { t: 46,   text: "그 말, 진심이었어?" },
    { t: 312,  text: "그 회사가 우리를 모케 했어. 처음부터." },
    { t: 610,  text: "놔, 놓으라고!" },
    { t: 620,  text: "(타격음) — 너 지금 뭐 한 거야." },
    { t: 980,  text: "이러지 마. 제발." },
    { t: 1248, text: "비가 그칠 때까지만 기다릴게." },
    { t: 2042, text: "넌 평생 그 모양으로 살 거야." },
    { t: 2196, text: "다신 보지 말자." },
  ],
};

// 검색 결과 (질의: "한강에서 촬영한 야간 장면")
export const SEARCH_QUERY = "한강에서 촬영한 야간 장면";
export const SEARCH_RESULTS = [
  { video: "한강의 사계 — 본편", vid: "v-2037", t: 1842, source: "both",
    reason: "‘한강’ 키워드 일치 + 야간 수변 장면 의미 유사", scoreK: 0.91, scoreV: 0.88,
    scene: "한강 둔치 야경, 다리 조명 반사. 산책로 보행자 실루엣." },
  { video: "도시의 밤 — 12회", vid: "v-2041", t: 1248, source: "vector",
    reason: "‘한강’ 직접 언급은 없으나 야간 강변·저조도 장면으로 의미 근접", scoreK: 0.12, scoreV: 0.79,
    scene: "비 내리는 야간 강변 골목, 우산 든 인물 단독 보행." },
  { video: "뉴스특보 — 집중호우", vid: "v-2036", t: 188, source: "keyword",
    reason: "자막에 ‘한강 수위’ 키워드 직접 등장", scoreK: 0.84, scoreV: 0.41,
    scene: "한강대교 주간 현장 중계 — 의미 점수 낮아 후순위." },
  { video: "한강의 사계 — 본편", vid: "v-2037", t: 2604, source: "both",
    reason: "‘야간’ 키워드 + 강 수면 반영 장면 의미 유사", scoreK: 0.66, scoreV: 0.72,
    scene: "야간 강 수면 위 윤슬, 고정 카메라 타임랩스." },
];

export const SEARCH_MODES = [
  { key: "hybrid",  label: "hybrid",  desc: "키워드 + 의미 점수 합산", note: "기본값" },
  { key: "keyword", label: "keyword", desc: "정확한 단어 매칭" },
  { key: "vector",  label: "vector",  desc: "의미가 비슷한 내용" },
  { key: "filter",  label: "filter",  desc: "날짜·카테고리 등 조건" },
];

// 시:분:초 포맷
export function tc(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
