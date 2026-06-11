# ARC 백엔드 설계 — 영상 아카이브 & 검수 시스템

2026-06-11 · PRD v1.1(`PRD_영상아카이브검수시스템.md`) 기반 · 사용자 승인 완료

## 목표

기존 ARC React UI(`archive-review/`)의 목 데이터를 실제 백엔드로 교체한다.
업로드 → 자동 분석(병렬) → 자연어 검색 → 금칙 검수 리포트 → 텔레그램 알림 → 삭제까지
PRD의 메인 흐름 전체를 실데이터로 처리한다.

## 스택 결정

- **Node.js 24 + Express** — 프론트와 언어 통일. 사용자 선택.
- **AI**: OpenAI 호스팅 API (`.env`의 키 사용)
  - 음성 인식: Whisper API (`whisper-1`)
  - 비전·교정·판정: GPT-4o (`OPENAI_MODEL`로 변경 가능)
  - 임베딩: `text-embedding-3-small`
- **미디어**: ffmpeg/ffprobe 8.1.1 (시스템 설치 확인됨) CLI 호출
- **저장소**: SQLite 단일 파일 (`better-sqlite3`) — 외부 서버 없음, 재시작 후 유지

## 구조

```
project4/
├─ archive-review/          # React UI — API 연동으로 전환 (레이아웃 불변)
├─ server/
│  ├─ src/
│  │  ├─ index.js           # Express 앱 · 라우터 · SSE
│  │  ├─ db.js              # 스키마 초기화 + 쿼리
│  │  ├─ pipeline/
│  │  │  ├─ run.js          # 단계 오케스트레이션 (병렬/의존/실패 격리)
│  │  │  ├─ probe.js        # ffprobe 메타데이터
│  │  │  ├─ caption.js      # 자막 추출(내장 트랙 → 없으면 Whisper) → GPT 교정
│  │  │  ├─ scene.js        # 장면 분석 (대표 프레임 → GPT-4o 설명)
│  │  │  ├─ tech.js         # 무음/블랙/프리즈/클리핑 (ffmpeg 필터)
│  │  │  ├─ indexer.js      # FTS5 키워드 색인 + 임베딩 벡터 색인
│  │  │  ├─ sample.js       # 프레임 샘플링 (~1초 간격 JPEG)
│  │  │  ├─ judge.js        # 연속 2~3장 묶음 + 자막 근거 금칙 판정
│  │  │  └─ verdict.js      # 종합 판정 · report.json · violations.csv
│  │  ├─ search.js          # hybrid/keyword/vector/filter 4모드
│  │  ├─ telegram.js        # 완료 알림 (Bot API sendMessage)
│  │  └─ openai.js          # OpenAI 호출 공통 (재시도 포함)
│  ├─ rules/금칙기준.md       # 판정 기준 — 코드 밖, 수정 즉시 다음 영상부터 반영
│  ├─ docs/운영절차서.md      # 검수 흐름 및 판정 기준 문서 (산출물)
│  └─ data/                 # uploads/ frames/ arc.db (gitignore)
└─ .env                     # 키 관리 — 코드에 키 포함 금지 (gitignore)
```

## 데이터 모델 (SQLite)

- `videos` — id, title, file, size, duration, resolution, status(`processing|done|error`),
  caption_source, uploaded_at, processed_at, worst_score, counts(JSON), top_category
- `stages` — video_id, key, status, progress, error (재시작 시 복원용 스냅숏)
- `captions` — video_id, t, text, corrected(0/1), before_text
- `scenes` — video_id, t, desc, frame_path
- `tech_findings` — video_id, kind, start, end, note
- `flags` — video_id, t, cat, score, group_n, desc, audio, basis, frame_paths(JSON)
- `timeline` — video_id, start, end, kind(`ok|silence|review|violation`)
- `captions_fts` — FTS5 가상 테이블 (자막 + 장면 설명) ← 키워드 색인
- `embeddings` — video_id, t, kind, text, vector(BLOB) ← 벡터 색인 (코사인 유사도는 JS)

저장소 2종 병행 = `captions_fts`(키워드) + `embeddings`(벡터). PRD §7 충족.

## 파이프라인 (PRD §4-2, §5)

의존 그래프 (UI의 단계 키와 1:1):

```
extract(자막 추출) → correct(자막 교정) ─┐
scene(장면 분석) ──────────────────────┼→ index(색인 생성)
tech(기술 검토) ───────────────────────┘
sample(프레임 샘플링) → judge(금칙 판정, sample 50%부터) → verdict(종합 판정)
```

- 영상 간 병렬: 업로드마다 독립 실행. 영상 내 병렬: 위 그래프상 독립 단계 동시 실행.
- **실패 격리**: 단계별 try/catch. 실패 시 해당 단계 `error` 기록, 의존 단계는 가능한 입력만으로 진행.
  프레임 판정 실패 시 해당 묶음은 `정상` 처리 후 계속 (PRD 판정 원칙).
- 진행률: 메모리 잡 상태 → `GET /api/events` SSE 브로드캐스트. 완료 시 DB에 영구 저장.

### 금칙 판정 상세 (PRD §4-4 v1.1 방식)

- 샘플링 약 1초 간격 (`SAMPLE_INTERVAL_SEC`, 기본 1)
- 연속 2~3장 묶음(`JUDGE_GROUP_SIZE`, 기본 3)으로 GPT-4o 비전 호출, 이미지 low detail
- 해당 구간 자막(대사·소리)을 판단 근거로 프롬프트에 포함
- 시스템 프롬프트 = `rules/금칙기준.md` 전문 — 8개 카테고리(성표현·폭력·충격혐오·유해행위·인격권·차별증오·아동청소년·광고저작권), 심각도 0~5
  - "의도적 탈의·성적 어필 = 4(방영 불가)" 명시 포함
- 심각도: 0 통과 / 1–2 주의 / 3 경고(검토필요) / 4–5 방영불가. 모호하면 3(검토필요)으로.
- 산출물: `report.json`, `violations.csv` (다운로드 엔드포인트), 위반 프레임 JPEG

## API

| 메서드/경로 | 역할 |
|---|---|
| `POST /api/videos` | multipart 업로드(복수), 파이프라인 시작 |
| `GET /api/videos` | 대시보드 목록 |
| `GET /api/videos/:id/report` | 리포트 전체(타임라인·플래그·기술·장면·자막·교정) |
| `GET /api/videos/:id/report.json` | report.json 다운로드 |
| `GET /api/videos/:id/violations.csv` | 위반 목록 CSV 다운로드 |
| `GET /api/search?q=&mode=` | 4모드 검색 — 결과마다 썸네일 t·출처(keyword/vector/both)·이유·점수 |
| `DELETE /api/videos/:id` | 원본+리포트+색인+프레임 일괄 삭제. 처리 중이면 409 |
| `GET /api/events` | SSE — 단계 진행률·완료·실패 이벤트 |
| `GET /frames/...` | 프레임 JPEG 정적 서빙 |

검색 모드: keyword=FTS5 BM25, vector=임베딩 코사인, hybrid=두 점수 정규화 합산,
filter=프로그램·기간 조건 (질의 파싱은 단순 파라미터). 출처는 양쪽 모두 매칭 시 `both`.

## 프론트엔드 연동 (UI 변경 없이 데이터만 교체)

- `data.js` 목 데이터 → `api.js` (fetch 래퍼) 신규
- 대시보드/리포트/검색: API 데이터 렌더 (스키마는 목 데이터와 동일 형태 유지)
- 업로드: 실제 파일 전송(드래그앤드롭 + 파일 선택), SSE로 기존 프로그레스 바 갱신
- 썸네일 플레이스홀더 → 실제 프레임 `<img>` (플레이스홀더는 로딩/누락 폴백으로 유지)
- 완료 토스트: SSE 완료 이벤트 기반 (텔레그램 발송 결과 표시)
- Vite dev proxy: `/api`, `/frames` → `localhost:3001`

## 알림 · 보안 · 영속성

- 완료 시 텔레그램 sendMessage: 제목·종합 판정·위반 수·실패 단계 요약
- 키는 `.env`만. `.gitignore`: `.env*`, `server/data/`, `node_modules/`, `dist/`
- 서버 재시작 시: `processing` 상태로 남은 영상은 `error("서버 재시작으로 중단")` 처리
  (작업 재개는 v1 범위 밖), 완료 데이터는 전부 SQLite/디스크에서 복원

## 비용 제어

`.env`: `SAMPLE_INTERVAL_SEC=1`, `JUDGE_GROUP_SIZE=3`, `SCENE_INTERVAL_SEC=60`,
이미지 detail=low. 1시간 영상 기준 GPT-4o 비전 비용 대략 $1~2 수준.

## 검증

- 단위: 심각도 매핑·종합 판정 집계·hybrid 점수 병합·타임라인 구성 (node:test)
- E2E: 짧은 샘플 영상 생성(ffmpeg 합성) → 업로드 → 처리 완료 → 검색 → 리포트 → 삭제 1바퀴
- 실패 격리: 자막 트랙 없는 영상(→Whisper 경로), 단계 강제 실패 시 나머지 진행 확인

## 범위 밖 (PRD §10 동일)

계정/로그인, 영상 편집, 외부 스트리밍 URL, 모바일 앱, 처리 중단 작업 재개
