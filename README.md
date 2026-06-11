# ARC — 영상 아카이브 & 검수 시스템

영상을 올리면 자동으로 분석·저장하고, 자연어로 검색하며, 방영 전 금칙 검수까지 처리하는 웹 서비스.
PRD: `PRD_영상아카이브검수시스템.md` · 스펙: `docs/superpowers/specs/2026-06-11-arc-backend-design.md`

## 실행 방법

사전 요구: Node.js 24+, ffmpeg/ffprobe (PATH 등록), 프로젝트 루트의 `.env`

```powershell
# 1) 백엔드 (포트 3001)
npm start --prefix server

# 2) 웹 UI (포트 5173 — /api, /frames 는 3001 로 프록시)
npm run dev --prefix archive-review
```

브라우저에서 http://localhost:5173 접속.

## .env 키

| 키 | 용도 |
|---|---|
| `OPENAI_API_KEY` | Whisper 음성인식 · GPT-4o 비전/교정/판정 · 임베딩 |
| `OPENAI_MODEL` | 분석 모델 (기본 `gpt-4o`) |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | 처리 완료 알림 (없으면 알림만 생략) |
| `PORT` | 백엔드 포트 (기본 3001) |
| `SAMPLE_INTERVAL_SEC` | 금칙 검수 프레임 샘플링 간격, 초 (기본 1) |
| `JUDGE_GROUP_SIZE` | 연속 묶음 판정 프레임 수 (기본 3) |
| `SCENE_INTERVAL_SEC` | 장면 분석 간격, 초 (기본 60) |
| `JUDGE_CONCURRENCY` | 판정 동시 호출 수 (기본 4) |

비용 참고: 1시간 영상 기준 GPT-4o 비전(low detail) 판정 비용은 대략 $1~2.
긴 영상은 `SAMPLE_INTERVAL_SEC` 를 늘리면 비용이 비례해서 줄어든다 (짧은 장면 누락 위험은 증가).

## 판정 기준 변경

`server/rules/금칙기준.md` 수정 → 다음 영상부터 즉시 적용 (재배포 불필요).
운영 흐름은 `server/docs/운영절차서.md` 참고.

## 테스트

```powershell
npm test --prefix server          # 단위 테스트 (DB·파서·판정·검색·오케스트레이터)
node server/scripts/e2e.js        # E2E — 합성 영상으로 실제 업로드→처리→검색→삭제 1바퀴 (OpenAI 호출 발생)
```

## 구조

```
archive-review/   React UI (Vite) — 대시보드·업로드/실시간 처리·검색·검수 리포트
server/
  src/            Express API · SQLite(node:sqlite, FTS5+임베딩) · 파이프라인 8단계
  rules/          금칙기준.md (판정 기준 — 코드 밖)
  docs/           운영절차서.md
  data/           uploads/ frames/ arc.db (gitignore — 재시작 후 유지)
```
