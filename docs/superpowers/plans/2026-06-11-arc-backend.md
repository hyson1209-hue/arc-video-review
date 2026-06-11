# ARC 백엔드 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PRD v1.1의 업로드→자동분석(병렬)→검색→금칙검수→텔레그램 알림 흐름을 Express+SQLite+OpenAI 백엔드로 구현하고 기존 ARC React UI를 실데이터로 연동한다.

**Architecture:** Express 단일 서버(`server/`)가 업로드 수신 후 의존 그래프 기반 파이프라인(8단계, UI 단계 키와 1:1)을 영상별 비동기 실행. ffmpeg CLI로 미디어 처리, OpenAI API(Whisper/GPT-4o/임베딩)로 AI 분석, SQLite(FTS5+임베딩 테이블)로 저장소 2종 병행. 진행률은 SSE. 프론트는 목 데이터를 fetch/EventSource로 교체.

**Tech Stack:** Node 24, Express 5, multer, better-sqlite3(FTS5), openai SDK, ffmpeg/ffprobe 8.1(시스템), node:test

**스펙:** `docs/superpowers/specs/2026-06-11-arc-backend-design.md` (승인 완료)

**단순화 결정(스펙 대비):** judge 단계는 sample 완료 후 시작한다(soft-start 52% 미구현 — 로컬 샘플링은 수 초라 체감 차이 없음). UI 프로그레스는 실제 진행률을 그대로 표시.

---

### Task 1: 서버 스캐폴드 + 설정

**Files:**
- Create: `server/package.json`, `server/src/config.js`, `server/src/index.js`
- Move: `.env.local` → `.env` (내용 그대로, git 무시 확인)

- [ ] **Step 1: package.json 작성 후 의존성 설치**

```json
{
  "name": "arc-server",
  "private": true,
  "type": "module",
  "scripts": { "start": "node src/index.js", "test": "node --test" },
  "dependencies": {
    "better-sqlite3": "^11.8.0",
    "express": "^4.21.0",
    "multer": "^1.4.5-lts.1",
    "openai": "^4.77.0",
    "dotenv": "^16.4.0"
  }
}
```

Run: `npm install --prefix server` → exit 0

- [ ] **Step 2: `.env.local`을 `.env`로 복사하고 처리 파라미터 추가**

`.env` 끝에 추가:
```
PORT=3001
SAMPLE_INTERVAL_SEC=1
JUDGE_GROUP_SIZE=3
SCENE_INTERVAL_SEC=60
JUDGE_CONCURRENCY=4
```
`git status`로 `.env`가 untracked에 안 보이는지 확인 (`.gitignore`의 `.env` 규칙).

- [ ] **Step 3: config.js — 환경 로드·검증·경로 상수**

```js
// server/src/config.js
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: path.join(ROOT, ".env") });

export const config = {
  port: Number(process.env.PORT || 3001),
  openaiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "gpt-4o",
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  sampleInterval: Number(process.env.SAMPLE_INTERVAL_SEC || 1),
  judgeGroupSize: Number(process.env.JUDGE_GROUP_SIZE || 3),
  sceneInterval: Number(process.env.SCENE_INTERVAL_SEC || 60),
  judgeConcurrency: Number(process.env.JUDGE_CONCURRENCY || 4),
  serverDir: path.join(ROOT, "server"),
  dataDir: path.join(ROOT, "server", "data"),
  uploadsDir: path.join(ROOT, "server", "data", "uploads"),
  framesDir: path.join(ROOT, "server", "data", "frames"),
  dbPath: path.join(ROOT, "server", "data", "arc.db"),
  rulesPath: path.join(ROOT, "server", "rules", "금칙기준.md"),
};
if (!config.openaiKey) console.warn("[config] OPENAI_API_KEY 없음 — AI 단계는 실패 처리됩니다");
```

- [ ] **Step 4: index.js — Express 앱 뼈대 + 헬스체크, 기동 확인**

```js
// server/src/index.js
import express from "express";
import fs from "node:fs";
import { config } from "./config.js";

for (const d of [config.dataDir, config.uploadsDir, config.framesDir]) fs.mkdirSync(d, { recursive: true });

const app = express();
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/frames", express.static(config.framesDir));

app.listen(config.port, () => console.log(`[arc] http://localhost:${config.port}`));
export { app };
```

Run: `npm start --prefix server` 기동 후 `curl http://localhost:3001/api/health` → `{"ok":true}`. 종료.

- [ ] **Step 5: Commit** — `git add server .gitignore; git commit -m "feat(server): Express scaffold + config"`

---

### Task 2: DB 스키마 + 쿼리 계층

**Files:**
- Create: `server/src/db.js`
- Test: `server/test/db.test.js`

- [ ] **Step 1: 실패 테스트 작성** — 영상 생성/조회/삭제 캐스케이드

```js
// server/test/db.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";

function mem() { return openDb(":memory:"); }

test("createVideo → listVideos 에 나타난다", () => {
  const db = mem();
  db.createVideo({ id: "v1", title: "테스트", file: "t.mp4", size: 1000, uploadedAt: "2026-06-11 10:00" });
  const rows = db.listVideos();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "processing");
});

test("deleteVideoCascade 는 모든 연관 행을 지운다", () => {
  const db = mem();
  db.createVideo({ id: "v1", title: "t", file: "t.mp4", size: 1, uploadedAt: "x" });
  db.insertCaptions("v1", [{ t: 1, text: "안녕 한강" }]);
  db.insertFlag("v1", { t: 5, cat: "폭력", score: 4, groupN: 3, desc: "d", audio: "—", basis: "b", framePaths: [] });
  db.insertEmbedding("v1", { t: 1, kind: "caption", text: "안녕 한강", vector: new Float32Array([0.1, 0.2]) });
  db.rebuildFts("v1");
  db.deleteVideoCascade("v1");
  assert.equal(db.listVideos().length, 0);
  assert.equal(db.searchKeyword("한강").length, 0);
  assert.equal(db.allEmbeddings().length, 0);
});

test("getReport 는 리포트 구성요소를 모두 합친다", () => {
  const db = mem();
  db.createVideo({ id: "v1", title: "t", file: "t.mp4", size: 1, uploadedAt: "x" });
  db.insertCaptions("v1", [{ t: 1, text: "a", corrected: 1, beforeText: "b" }]);
  db.insertTimeline("v1", [{ start: 0, end: 10, kind: "ok" }]);
  const r = db.getReport("v1");
  assert.equal(r.captions.length, 1);
  assert.equal(r.corrections.length, 1);
  assert.equal(r.timeline.length, 1);
});
```

- [ ] **Step 2: 실패 확인** — `npm test --prefix server` → `Cannot find module '../src/db.js'`

- [ ] **Step 3: db.js 구현**

```js
// server/src/db.js
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, title TEXT, program TEXT DEFAULT '미분류', file TEXT, size INTEGER,
  duration REAL DEFAULT 0, resolution TEXT DEFAULT '', status TEXT DEFAULT 'processing',
  caption_source TEXT DEFAULT '', uploaded_at TEXT, processed_at TEXT,
  worst_score INTEGER DEFAULT 0, counts TEXT DEFAULT '{}', top_category TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS stages (
  video_id TEXT, key TEXT, status TEXT, progress REAL DEFAULT 0, error TEXT,
  PRIMARY KEY (video_id, key)
);
CREATE TABLE IF NOT EXISTS captions (video_id TEXT, t REAL, text TEXT, corrected INTEGER DEFAULT 0, before_text TEXT);
CREATE TABLE IF NOT EXISTS scenes (video_id TEXT, t REAL, desc TEXT, frame_path TEXT);
CREATE TABLE IF NOT EXISTS tech_findings (video_id TEXT, kind TEXT, start REAL, end REAL, note TEXT);
CREATE TABLE IF NOT EXISTS flags (
  video_id TEXT, t REAL, cat TEXT, score INTEGER, group_n INTEGER,
  desc TEXT, audio TEXT, basis TEXT, frame_paths TEXT
);
CREATE TABLE IF NOT EXISTS timeline (video_id TEXT, start REAL, end REAL, kind TEXT);
CREATE TABLE IF NOT EXISTS embeddings (video_id TEXT, t REAL, kind TEXT, text TEXT, vector BLOB);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(video_id UNINDEXED, t UNINDEXED, kind UNINDEXED, content);
`;

export function openDb(file) {
  const d = new Database(file);
  d.pragma("journal_mode = WAL");
  d.exec(SCHEMA);
  const j = (x) => JSON.stringify(x);

  return {
    raw: d,
    createVideo: (v) => {
      d.prepare(`INSERT INTO videos (id,title,file,size,uploaded_at) VALUES (?,?,?,?,?)`)
        .run(v.id, v.title, v.file, v.size, v.uploadedAt);
    },
    updateVideo: (id, fields) => {
      const keys = Object.keys(fields);
      d.prepare(`UPDATE videos SET ${keys.map(k => `${k}=?`).join(",")} WHERE id=?`)
        .run(...keys.map(k => typeof fields[k] === "object" && fields[k] !== null ? j(fields[k]) : fields[k]), id);
    },
    listVideos: () => d.prepare(`SELECT * FROM videos ORDER BY uploaded_at DESC`).all()
      .map(r => ({ ...r, counts: JSON.parse(r.counts || "{}") })),
    getVideo: (id) => {
      const r = d.prepare(`SELECT * FROM videos WHERE id=?`).get(id);
      return r ? { ...r, counts: JSON.parse(r.counts || "{}") } : null;
    },
    saveStage: (vid, key, s) => d.prepare(
      `INSERT INTO stages (video_id,key,status,progress,error) VALUES (?,?,?,?,?)
       ON CONFLICT(video_id,key) DO UPDATE SET status=excluded.status,progress=excluded.progress,error=excluded.error`
    ).run(vid, key, s.status, s.progress, s.error ?? null),
    getStages: (vid) => d.prepare(`SELECT * FROM stages WHERE video_id=?`).all(vid),
    insertCaptions: (vid, rows) => {
      const st = d.prepare(`INSERT INTO captions VALUES (?,?,?,?,?)`);
      const tx = d.transaction(rs => rs.forEach(c => st.run(vid, c.t, c.text, c.corrected ? 1 : 0, c.beforeText ?? null)));
      tx(rows);
    },
    insertScene: (vid, s) => d.prepare(`INSERT INTO scenes VALUES (?,?,?,?)`).run(vid, s.t, s.desc, s.framePath ?? null),
    insertTech: (vid, f) => d.prepare(`INSERT INTO tech_findings VALUES (?,?,?,?,?)`).run(vid, f.kind, f.start, f.end, f.note ?? ""),
    insertFlag: (vid, f) => d.prepare(`INSERT INTO flags VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(vid, f.t, f.cat, f.score, f.groupN, f.desc, f.audio ?? "—", f.basis ?? "", j(f.framePaths ?? [])),
    insertTimeline: (vid, segs) => {
      const st = d.prepare(`INSERT INTO timeline VALUES (?,?,?,?)`);
      const tx = d.transaction(ss => ss.forEach(s => st.run(vid, s.start, s.end, s.kind)));
      tx(segs);
    },
    insertEmbedding: (vid, e) => d.prepare(`INSERT INTO embeddings VALUES (?,?,?,?,?)`)
      .run(vid, e.t, e.kind, e.text, Buffer.from(e.vector.buffer)),
    allEmbeddings: () => d.prepare(`SELECT * FROM embeddings`).all()
      .map(r => ({ ...r, vector: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4) })),
    rebuildFts: (vid) => {
      d.prepare(`DELETE FROM docs_fts WHERE video_id=?`).run(vid);
      const st = d.prepare(`INSERT INTO docs_fts (video_id,t,kind,content) VALUES (?,?,?,?)`);
      const tx = d.transaction(() => {
        for (const c of d.prepare(`SELECT * FROM captions WHERE video_id=?`).all(vid)) st.run(vid, c.t, "caption", c.text);
        for (const s of d.prepare(`SELECT * FROM scenes WHERE video_id=?`).all(vid)) st.run(vid, s.t, "scene", s.desc);
      });
      tx();
    },
    searchKeyword: (q) => d.prepare(
      `SELECT video_id, t, kind, content, bm25(docs_fts) AS rank FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT 30`
    ).all(q),
    getReport: (vid) => ({
      video: d.prepare(`SELECT * FROM videos WHERE id=?`).get(vid),
      timeline: d.prepare(`SELECT start,end,kind FROM timeline WHERE video_id=? ORDER BY start`).all(vid),
      flags: d.prepare(`SELECT * FROM flags WHERE video_id=? ORDER BY score DESC, t`).all(vid)
        .map(f => ({ ...f, frame_paths: JSON.parse(f.frame_paths || "[]") })),
      tech: d.prepare(`SELECT kind,start,end,note FROM tech_findings WHERE video_id=? ORDER BY start`).all(vid),
      scenes: d.prepare(`SELECT t,desc,frame_path FROM scenes WHERE video_id=? ORDER BY t`).all(vid),
      captions: d.prepare(`SELECT t,text,corrected,before_text FROM captions WHERE video_id=? ORDER BY t`).all(vid),
      corrections: d.prepare(`SELECT t,before_text AS before,text AS after FROM captions WHERE video_id=? AND corrected=1 ORDER BY t`).all(vid),
    }),
    deleteVideoCascade: (vid) => {
      const tx = d.transaction(() => {
        for (const t of ["videos","stages","captions","scenes","tech_findings","flags","timeline","embeddings"])
          d.prepare(`DELETE FROM ${t} WHERE ${t === "videos" ? "id" : "video_id"}=?`).run(vid);
        d.prepare(`DELETE FROM docs_fts WHERE video_id=?`).run(vid);
      });
      tx();
    },
  };
}
```

- [ ] **Step 4: 통과 확인** — `npm test --prefix server` → 3 pass
- [ ] **Step 5: Commit** — `feat(server): SQLite schema + query layer (FTS5 포함)`

---

### Task 3: ffmpeg 유틸 + 기술 검토 파서

**Files:**
- Create: `server/src/ffmpeg.js`
- Test: `server/test/ffmpeg.test.js` (파서 단위 테스트 — ffmpeg 실행 없음)

- [ ] **Step 1: 실패 테스트 — stderr 파서**

```js
// server/test/ffmpeg.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { parseTechStderr, parseSrt } from "../src/ffmpeg.js";

test("silencedetect/blackdetect/freezedetect stderr 를 구간으로 파싱", () => {
  const stderr = [
    "[silencedetect @ 0x1] silence_start: 3.0",
    "[silencedetect @ 0x1] silence_end: 15.2 | silence_duration: 12.2",
    "[blackdetect @ 0x2] black_start:0 black_end:4.1 black_duration:4.1",
    "[freezedetect @ 0x3] lavfi.freezedetect.freeze_start: 130.8",
    "[freezedetect @ 0x3] lavfi.freezedetect.freeze_end: 132.9",
  ].join("\n");
  const out = parseTechStderr(stderr);
  assert.deepEqual(out, [
    { kind: "무음", start: 3.0, end: 15.2 },
    { kind: "블랙", start: 0, end: 4.1 },
    { kind: "프리즈", start: 130.8, end: 132.9 },
  ]);
});

test("SRT 파싱 → {t, text}", () => {
  const srt = "1\n00:00:01,000 --> 00:00:03,000\n안녕하세요\n\n2\n00:01:02,500 --> 00:01:04,000\n반갑습니다\n줄바꿈\n";
  assert.deepEqual(parseSrt(srt), [
    { t: 1, text: "안녕하세요" },
    { t: 62.5, text: "반갑습니다 줄바꿈" },
  ]);
});
```

- [ ] **Step 2: 실패 확인** — `npm test --prefix server` → import 에러
- [ ] **Step 3: ffmpeg.js 구현**

```js
// server/src/ffmpeg.js
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", c => out += c);
    p.stderr.on("data", c => err += c);
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve({ out, err }) : reject(new Error(`${bin} exit ${code}: ${err.slice(-400)}`)));
  });
}

export async function probe(file) {
  const { out } = await run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file]);
  const info = JSON.parse(out);
  const v = (info.streams || []).find(s => s.codec_type === "video") || {};
  const fps = v.avg_frame_rate?.includes("/") ? (([a, b]) => b > 0 ? (a / b).toFixed(3) : "?")(v.avg_frame_rate.split("/").map(Number)) : "?";
  return {
    duration: Number(info.format?.duration || 0),
    resolution: v.width ? `${v.width}×${v.height} · ${fps}fps` : "",
    hasSubtitles: (info.streams || []).some(s => s.codec_type === "subtitle"),
  };
}

// 내장 자막 추출 — 트랙 없으면 null
export async function extractSubtitles(file, outDir) {
  const srtPath = path.join(outDir, "subs.srt");
  try {
    await run("ffmpeg", ["-y", "-i", file, "-map", "0:s:0", srtPath]);
    return fs.existsSync(srtPath) && fs.statSync(srtPath).size > 0 ? fs.readFileSync(srtPath, "utf8") : null;
  } catch { return null; }
}

export async function extractAudio(file, outDir) {
  const wav = path.join(outDir, "audio.wav");
  await run("ffmpeg", ["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", wav]);
  return wav;
}

// t초 지점 프레임 1장 추출
export async function frameAt(file, t, outPath, height = 270) {
  await run("ffmpeg", ["-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=-2:${height}`, "-q:v", "5", outPath]);
  return outPath;
}

// interval초 간격 연속 프레임 → [{t, path}]
export async function sampleFrames(file, outDir, interval) {
  fs.mkdirSync(outDir, { recursive: true });
  await run("ffmpeg", ["-y", "-i", file, "-vf", `fps=1/${interval},scale=-2:270`, "-q:v", "5", path.join(outDir, "f-%05d.jpg")]);
  return fs.readdirSync(outDir).filter(f => f.startsWith("f-")).sort()
    .map((f, i) => ({ t: i * interval, path: path.join(outDir, f) }));
}

export async function detectTech(file) {
  // -f null: 디코드만 수행, 필터 로그는 stderr 로
  const args = ["-i", file, "-vf", "blackdetect=d=1:pix_th=0.10,freezedetect=n=-60dB:d=2",
    "-af", "silencedetect=noise=-35dB:d=2", "-f", "null", "-"];
  const { err } = await run("ffmpeg", args).catch(e => ({ err: String(e.message) }));
  return parseTechStderr(err);
}

export function parseTechStderr(stderr) {
  const out = [];
  let silStart = null, frzStart = null;
  for (const line of stderr.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/silence_start: ([\d.]+)/))) silStart = Number(m[1]);
    else if ((m = line.match(/silence_end: ([\d.]+)/)) && silStart != null) {
      out.push({ kind: "무음", start: silStart, end: Number(m[1]) }); silStart = null;
    } else if ((m = line.match(/black_start:([\d.]+) black_end:([\d.]+)/)))
      out.push({ kind: "블랙", start: Number(m[1]), end: Number(m[2]) });
    else if ((m = line.match(/freeze_start: ([\d.]+)/))) frzStart = Number(m[1]);
    else if ((m = line.match(/freeze_end: ([\d.]+)/)) && frzStart != null) {
      out.push({ kind: "프리즈", start: frzStart, end: Number(m[1]) }); frzStart = null;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function parseSrt(srt) {
  const blocks = srt.replace(/\r/g, "").split(/\n\n+/).filter(b => b.trim());
  const rows = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const ti = lines.findIndex(l => l.includes("-->"));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const text = lines.slice(ti + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) rows.push({ t, text });
  }
  return rows;
}
```

- [ ] **Step 4: 통과 확인** — 2 pass
- [ ] **Step 5: Commit** — `feat(server): ffmpeg wrapper + tech/srt parsers`

---

### Task 4: OpenAI 래퍼 + 텔레그램

**Files:**
- Create: `server/src/openai.js`, `server/src/telegram.js`

(외부 API 모듈 — 단위 테스트 없음. E2E(Task 11)에서 실호출 검증.)

- [ ] **Step 1: openai.js**

```js
// server/src/openai.js
import OpenAI from "openai";
import fs from "node:fs";
import { config } from "./config.js";

const client = new OpenAI({ apiKey: config.openaiKey });

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) {
      last = e;
      if (e.status && e.status < 500 && e.status !== 429) throw e; // 4xx(429 제외)는 재시도 무의미
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw last;
}

// JSON 응답 채팅 (vision 포함) — messages 는 OpenAI 형식 그대로
export const chatJson = (messages) => withRetry(async () => {
  const r = await client.chat.completions.create({
    model: config.model, messages, response_format: { type: "json_object" }, max_tokens: 700,
  });
  return JSON.parse(r.choices[0].message.content);
});

export const imagePart = (filePath) => ({
  type: "image_url",
  image_url: { url: `data:image/jpeg;base64,${fs.readFileSync(filePath).toString("base64")}`, detail: "low" },
});

export const transcribe = (audioPath) => withRetry(async () => {
  const r = await client.audio.transcriptions.create({
    file: fs.createReadStream(audioPath), model: "whisper-1",
    response_format: "verbose_json", language: "ko",
  });
  return (r.segments || []).map(s => ({ t: s.start, text: s.text.trim() })).filter(s => s.text);
});

export const embed = (texts) => withRetry(async () => {
  const r = await client.embeddings.create({ model: "text-embedding-3-small", input: texts });
  return r.data.map(d => new Float32Array(d.embedding));
});
```

- [ ] **Step 2: telegram.js**

```js
// server/src/telegram.js
import { config } from "./config.js";

export async function notify(text) {
  if (!config.telegramToken || !config.telegramChatId) return { ok: false, skipped: true };
  try {
    const r = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, parse_mode: "HTML" }),
    });
    return await r.json();
  } catch (e) { return { ok: false, error: String(e) }; }
}
```

- [ ] **Step 3: Commit** — `feat(server): OpenAI wrapper + telegram notify`

---

### Task 5: 판정 규칙 문서 + 운영절차서

**Files:**
- Create: `server/rules/금칙기준.md`, `server/docs/운영절차서.md`

- [ ] **Step 1: 금칙기준.md** — 8개 카테고리(성표현·폭력·충격혐오·유해행위·인격권·차별증오·아동청소년·광고저작권) 각각에 판정 기준과 심각도 예시(0~5)를 방송심의에 관한 규정(`방송심의에_관한_규정.md` 참조) 조문 기반으로 작성. 다음 명시 조항 포함(PRD v1.1):
  - "의도적 탈의·성적 어필 = 4(방영 불가)"
  - "모호하거나 경계 사례 = 3(검토필요)로 분류해 사람이 최종 확인"
  - 심각도 표: 0 통과 / 1–2 주의 / 3 경고(검토필요) / 4–5 방영불가
- [ ] **Step 2: 운영절차서.md** — 검수 흐름(업로드→분석→판정→리포트), 판정 기준 변경 방법(이 파일 수정 → 다음 영상부터 적용), 산출물(report.json/violations.csv) 설명.
- [ ] **Step 3: Commit** — `docs(server): 금칙기준 + 운영절차서`

---

### Task 6: 종합 판정 로직 (verdict) — 순수 로직 TDD

**Files:**
- Create: `server/src/pipeline/verdict.js`
- Test: `server/test/verdict.test.js`

- [ ] **Step 1: 실패 테스트**

```js
// server/test/verdict.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, buildTimeline, toCsv } from "../src/pipeline/verdict.js";

test("aggregate: worst/counts/topCategory", () => {
  const flags = [
    { t: 10, cat: "폭력", score: 4 }, { t: 20, cat: "폭력", score: 3 },
    { t: 30, cat: "성표현", score: 2 }, { t: 40, cat: "광고저작권", score: 1 },
  ];
  const a = aggregate(flags);
  assert.equal(a.worstScore, 4);
  assert.deepEqual(a.counts, { block: 1, warn: 1, caution: 2 });
  assert.equal(a.topCategory, "폭력");
});

test("aggregate: 플래그 없음 → 통과", () => {
  assert.deepEqual(aggregate([]), { worstScore: 0, counts: { block: 0, warn: 0, caution: 0 }, topCategory: null });
});

test("buildTimeline: 위반>검토필요>무음 우선순위로 ok 위에 오버레이", () => {
  const segs = buildTimeline(100, 
    [{ t: 50, score: 4, groupN: 3 }, { t: 70, score: 3, groupN: 2 }],
    [{ kind: "무음", start: 10, end: 20 }], 1);
  // 정렬·연속·전체커버 확인
  assert.equal(segs[0].start, 0);
  assert.equal(segs.at(-1).end, 100);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].start, segs[i - 1].end);
  assert.ok(segs.some(s => s.kind === "violation" && s.start === 50));
  assert.ok(segs.some(s => s.kind === "review" && s.start === 70));
  assert.ok(segs.some(s => s.kind === "silence" && s.start === 10));
});

test("toCsv: 위반 목록 CSV", () => {
  const csv = toCsv([{ t: 614, cat: "폭력", score: 4, desc: '몸싸움, "심한" 장면' }]);
  assert.match(csv, /^t,category,score,severity,desc/);
  assert.match(csv, /614,폭력,4,방영불가,"몸싸움, ""심한"" 장면"/);
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: verdict.js 구현**

```js
// server/src/pipeline/verdict.js
export function sevKey(score) {
  return score >= 4 ? "block" : score === 3 ? "warn" : score >= 1 ? "caution" : "pass";
}
const SEV_LABEL = { block: "방영불가", warn: "경고", caution: "주의", pass: "통과" };

export function aggregate(flags) {
  const counts = { block: 0, warn: 0, caution: 0 };
  let worst = 0, top = null;
  for (const f of flags) {
    const k = sevKey(f.score);
    if (counts[k] != null) counts[k]++;
    if (f.score > worst) { worst = f.score; top = f.cat; }
  }
  return { worstScore: worst, counts, topCategory: top };
}

// duration 전체를 ok 로 깔고, 무음→검토필요→위반 순으로 덮어쓴다 (나중 것이 우선)
export function buildTimeline(duration, flags, techFindings, sampleInterval) {
  const marks = new Array(Math.max(1, Math.ceil(duration)));
  marks.fill("ok");
  const paint = (s, e, kind) => {
    for (let i = Math.max(0, Math.floor(s)); i < Math.min(marks.length, Math.ceil(e)); i++) marks[i] = kind;
  };
  for (const t of techFindings) if (t.kind === "무음") paint(t.start, t.end, "silence");
  for (const f of flags) if (f.score === 3) paint(f.t, f.t + (f.groupN || 1) * sampleInterval, "review");
  for (const f of flags) if (f.score >= 4) paint(f.t, f.t + (f.groupN || 1) * sampleInterval, "violation");
  const segs = [];
  for (let i = 0; i < marks.length; i++) {
    if (!segs.length || segs.at(-1).kind !== marks[i]) segs.push({ start: i, end: i + 1, kind: marks[i] });
    else segs.at(-1).end = i + 1;
  }
  if (segs.length) segs.at(-1).end = duration;
  return segs;
}

export function toCsv(flags) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = ["t,category,score,severity,desc"];
  for (const f of flags) lines.push(`${f.t},${f.cat},${f.score},${SEV_LABEL[sevKey(f.score)]},${esc(f.desc)}`);
  return lines.join("\n");
}
```

- [ ] **Step 4: 통과 확인** — 4 pass
- [ ] **Step 5: Commit** — `feat(server): verdict aggregation + timeline + csv (TDD)`

---

### Task 7: 파이프라인 단계 + 오케스트레이터

**Files:**
- Create: `server/src/pipeline/stages.js` (caption/scene/tech/index/sample/judge 단계 함수)
- Create: `server/src/pipeline/run.js` (의존 그래프 실행기)
- Create: `server/src/events.js` (SSE 브로드캐스터)
- Test: `server/test/run.test.js` (가짜 단계로 의존·실패 격리 검증)

- [ ] **Step 1: 실패 테스트 — 오케스트레이터**

```js
// server/test/run.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { runGraph } from "../src/pipeline/run.js";

test("의존 순서 보장 + 독립 단계 병렬", async () => {
  const order = [];
  const mk = (key) => async () => { order.push(key); };
  const stages = [
    { key: "a", deps: [], fn: mk("a") },
    { key: "b", deps: ["a"], fn: mk("b") },
    { key: "c", deps: [], fn: mk("c") },
    { key: "d", deps: ["b", "c"], fn: mk("d") },
  ];
  const res = await runGraph(stages, () => {});
  assert.ok(order.indexOf("a") < order.indexOf("b"));
  assert.ok(order.indexOf("b") < order.indexOf("d"));
  assert.ok(order.indexOf("c") < order.indexOf("d"));
  assert.equal(res.a.status, "done");
});

test("한 단계 실패해도 의존 단계는 계속 실행 (실패 격리)", async () => {
  const ran = [];
  const stages = [
    { key: "a", deps: [], fn: async () => { throw new Error("디코드 오류"); } },
    { key: "b", deps: ["a"], fn: async () => { ran.push("b"); } },
  ];
  const res = await runGraph(stages, () => {});
  assert.equal(res.a.status, "error");
  assert.match(res.a.error, /디코드 오류/);
  assert.equal(res.b.status, "done");
  assert.deepEqual(ran, ["b"]);
});

test("진행률 콜백이 stage 키와 함께 호출된다", async () => {
  const events = [];
  const stages = [{ key: "a", deps: [], fn: async (report) => { report(50); report(100); } }];
  await runGraph(stages, (key, progress) => events.push([key, progress]));
  assert.deepEqual(events.filter(e => e[0] === "a").map(e => e[1]).slice(0, 2), [50, 100]);
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: run.js 구현** — 단계 fn 시그니처는 `fn(reportProgress)` (ctx 는 클로저로 바인딩)

```js
// server/src/pipeline/run.js
// stages: [{ key, deps: [], fn: async (reportProgress) => {} }]
// onEvent(key, progress, status, errorMsg?) — 시작/진행/완료/실패 모두 통지
export async function runGraph(stages, onEvent) {
  const state = {};
  const promises = {};
  for (const s of stages) state[s.key] = { status: "wait", progress: 0, error: null };

  const runOne = (s) => {
    promises[s.key] = (async () => {
      await Promise.all(s.deps.map(d => promises[d])); // 실패해도 resolve 됨(아래 catch 내부 처리)
      state[s.key].status = "run";
      onEvent(s.key, 0, "run");
      try {
        await s.fn((p) => { state[s.key].progress = p; onEvent(s.key, p, "run"); });
        state[s.key] = { status: "done", progress: 100, error: null };
        onEvent(s.key, 100, "done");
      } catch (e) {
        state[s.key] = { status: "error", progress: state[s.key].progress, error: String(e.message || e) };
        onEvent(s.key, state[s.key].progress, "error", state[s.key].error);
      }
    })();
  };
  stages.forEach(runOne);
  await Promise.all(Object.values(promises));
  return state;
}
```

- [ ] **Step 4: 통과 확인** — 3 pass, Commit — `feat(server): dependency-graph stage runner with failure isolation (TDD)`

- [ ] **Step 5: events.js — SSE 허브**

```js
// server/src/events.js
const clients = new Set();
export function sseHandler(req, res) {
  res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
  res.write(":ok\n\n");
  clients.add(res);
  req.on("close", () => clients.delete(res));
}
export function broadcast(event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const c of clients) c.write(line);
}
```

- [ ] **Step 6: stages.js — 실제 8단계 구성** (핵심 모듈. 전부 ctx 클로저 기반.)

```js
// server/src/pipeline/stages.js
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import * as ff from "../ffmpeg.js";
import { chatJson, imagePart, transcribe, embed } from "../openai.js";
import { aggregate, buildTimeline, toCsv, sevKey } from "./verdict.js";

const CATS = ["성표현","폭력","충격혐오","유해행위","인격권","차별증오","아동청소년","광고저작권"];

// ctx: { id, srcPath, workDir(=uploads/id), frameDir(=frames/id), db, shared:{} }
export function buildStages(ctx) {
  const { db, id } = ctx;
  const sh = ctx.shared; // 단계 간 산출물 공유

  return [
    { key: "extract", deps: [], fn: async (report) => {
      const meta = await ff.probe(ctx.srcPath);
      sh.duration = meta.duration;
      db.updateVideo(id, { duration: meta.duration, resolution: meta.resolution });
      report(15);
      const srt = meta.hasSubtitles ? await ff.extractSubtitles(ctx.srcPath, ctx.workDir) : null;
      if (srt) {
        sh.captions = ff.parseSrt(srt);
        sh.captionSource = "내장 자막";
        report(100); return;
      }
      report(30); // 음성 인식 경로
      const wav = await ff.extractAudio(ctx.srcPath, ctx.workDir);
      report(55);
      sh.captions = await transcribe(wav);
      sh.captionSource = "음성 인식 생성";
    }},

    { key: "correct", deps: ["extract"], fn: async (report) => {
      const caps = sh.captions || [];
      if (!caps.length) { sh.corrected = []; return; }
      const out = [];
      const CHUNK = 40;
      for (let i = 0; i < caps.length; i += CHUNK) {
        const chunk = caps.slice(i, i + CHUNK);
        const r = await chatJson([
          { role: "system", content: "당신은 한국어 방송 자막 교정가다. 오탈자·잘못 들린 단어만 고친다. 바뀐 항목만 {\"fixes\":[{\"i\":인덱스,\"after\":\"교정문\"}]} JSON 으로." },
          { role: "user", content: chunk.map((c, j) => `${j}: ${c.text}`).join("\n") },
        ]).catch(() => ({ fixes: [] })); // 교정 실패는 원본 유지
        const fixes = new Map((r.fixes || []).map(f => [f.i, f.after]));
        chunk.forEach((c, j) => out.push(fixes.has(j) && fixes.get(j) !== c.text
          ? { t: c.t, text: fixes.get(j), corrected: 1, beforeText: c.text }
          : { t: c.t, text: c.text }));
        report(Math.round((i + CHUNK) / caps.length * 100));
      }
      sh.corrected = out;
      db.insertCaptions(id, out);
      db.updateVideo(id, { caption_source: sh.captionSource || "" });
    }},

    { key: "scene", deps: [], fn: async (report) => {
      const dur = sh.duration || (await ff.probe(ctx.srcPath)).duration;
      const interval = Math.min(config.sceneInterval, Math.max(5, dur / 4));
      const ts = []; for (let t = interval / 2; t < dur; t += interval) ts.push(Math.round(t));
      sh.scenes = [];
      for (let i = 0; i < ts.length; i++) {
        const fp = path.join(ctx.frameDir, `scene-${ts[i]}.jpg`);
        await ff.frameAt(ctx.srcPath, ts[i], fp);
        const r = await chatJson([
          { role: "system", content: "방송 아카이브 색인용 장면 설명가. 화면을 보고 한국어 1~2문장으로 객관적으로 설명. {\"desc\":\"...\"} JSON." },
          { role: "user", content: [imagePart(fp)] },
        ]);
        const scene = { t: ts[i], desc: r.desc || "", framePath: `/frames/${id}/scene-${ts[i]}.jpg` };
        sh.scenes.push(scene);
        db.insertScene(id, scene);
        report(Math.round((i + 1) / ts.length * 100));
      }
    }},

    { key: "tech", deps: [], fn: async (report) => {
      report(10);
      sh.tech = await ff.detectTech(ctx.srcPath);
      for (const f of sh.tech) db.insertTech(id, { ...f, note: "" });
    }},

    { key: "index", deps: ["correct", "scene", "tech"], fn: async (report) => {
      // 실패한 선행 단계가 있어도 가진 데이터로만 색인 (실패 격리)
      db.rebuildFts(id);
      report(40);
      const docs = [
        ...(sh.corrected || []).map(c => ({ t: c.t, kind: "caption", text: c.text })),
        ...(sh.scenes || []).map(s => ({ t: s.t, kind: "scene", text: s.desc })),
      ].filter(d => d.text);
      for (let i = 0; i < docs.length; i += 64) {
        const batch = docs.slice(i, i + 64);
        const vecs = await embed(batch.map(d => d.text));
        batch.forEach((d, j) => db.insertEmbedding(id, { ...d, vector: vecs[j] }));
        report(40 + Math.round((i + 64) / docs.length * 60));
      }
    }},

    { key: "sample", deps: [], fn: async (report) => {
      report(5);
      sh.frames = await ff.sampleFrames(ctx.srcPath, path.join(ctx.frameDir, "s"), config.sampleInterval);
    }},

    { key: "judge", deps: ["sample"], fn: async (report) => {
      const frames = sh.frames || [];
      const rules = fs.readFileSync(config.rulesPath, "utf8");
      const caps = sh.corrected || sh.captions || [];
      const G = config.judgeGroupSize;
      const groups = [];
      for (let i = 0; i < frames.length; i += G) groups.push(frames.slice(i, i + G));
      sh.flags = [];
      let doneN = 0;
      const judgeGroup = async (g) => {
        const t0 = g[0].t, t1 = g.at(-1).t;
        const nearby = caps.filter(c => c.t >= t0 - 2 && c.t <= t1 + 2).map(c => c.text).join(" / ");
        try {
          const r = await chatJson([
            { role: "system", content:
              `당신은 방송 금칙 검수관이다. 아래 기준 문서에 따라 연속 프레임 묶음을 판정한다.\n` +
              `움직임의 흐름(때리기·밀치기 등)과 대사·소리를 함께 근거로 쓴다. 모호하면 3(검토필요).\n` +
              `JSON: {"score":0-5,"category":"${CATS.join("|")}"|null,"desc":"판정 이유 한 문장","audio":"근거 소리·대사 요약 또는 —"}\n\n` +
              `--- 금칙기준.md ---\n${rules}` },
            { role: "user", content: [
              { type: "text", text: `타임코드 ${t0}~${t1}초 연속 ${g.length}장. 구간 대사/소리: ${nearby || "(없음)"}` },
              ...g.map(f => imagePart(f.path)),
            ]},
          ]);
          const score = Math.max(0, Math.min(5, Number(r.score) || 0));
          if (score >= 1 && CATS.includes(r.category)) {
            const flag = { t: t0, cat: r.category, score, groupN: g.length,
              desc: r.desc || "", audio: r.audio || "—",
              basis: `연속 ${g.length}장${nearby ? " · 대사·소리" : ""}`,
              framePaths: g.map(f => `/frames/${id}/s/${path.basename(f.path)}`) };
            sh.flags.push(flag);
            db.insertFlag(id, flag);
          }
        } catch { /* 프레임 처리 실패 → 정상 처리 후 계속 (PRD 판정 원칙) */ }
        report(Math.round(++doneN / groups.length * 100));
      };
      // 제한 동시성 워커 풀
      const queue = [...groups];
      await Promise.all(Array.from({ length: config.judgeConcurrency }, async () => {
        while (queue.length) await judgeGroup(queue.shift());
      }));
      sh.flags.sort((a, b) => b.score - a.score || a.t - b.t);
    }},

    { key: "verdict", deps: ["judge", "tech"], fn: async (report) => {
      const dur = sh.duration || 0;
      const flags = sh.flags || [];
      const agg = aggregate(flags);
      const timeline = buildTimeline(dur, flags, sh.tech || [], config.sampleInterval);
      db.insertTimeline(id, timeline);
      report(50);
      db.updateVideo(id, { worst_score: agg.worstScore, counts: agg.counts, top_category: agg.topCategory });
      fs.writeFileSync(path.join(ctx.workDir, "violations.csv"), "﻿" + toCsv(flags));
      fs.writeFileSync(path.join(ctx.workDir, "report.json"),
        JSON.stringify({ id, ...agg, flags, timeline, tech: sh.tech, generatedAt: new Date().toISOString() }, null, 2));
      sh.agg = agg;
    }},
  ];
}
```

- [ ] **Step 7: 파이프라인 진입점 — run.js 에 추가**

```js
// run.js 에 추가
import fs from "node:fs";
import path from "node:path";
import { buildStages } from "./stages.js";
import { broadcast } from "../events.js";
import { notify } from "../telegram.js";
import { sevKey } from "./verdict.js";
const SEV_LABEL = { block: "방영 불가", warn: "경고", caution: "주의", pass: "통과" };

export async function processVideo(db, video, srcPath, framesRoot) {
  const frameDir = path.join(framesRoot, video.id);
  fs.mkdirSync(frameDir, { recursive: true });
  const ctx = { id: video.id, srcPath, workDir: path.dirname(srcPath), frameDir, db, shared: {} };
  const stages = buildStages(ctx);
  for (const s of stages) db.saveStage(video.id, s.key, { status: "wait", progress: 0 });

  const state = await runGraph(stages, (key, progress, status, error) => {
    db.saveStage(video.id, key, { status: status || "run", progress, error });
    broadcast({ type: "stage", videoId: video.id, key, progress, status, error });
  });

  const failed = Object.entries(state).filter(([, s]) => s.status === "error").map(([k]) => k);
  db.updateVideo(video.id, { status: "done", processed_at: new Date().toISOString().slice(0, 16).replace("T", " ") });
  const v = db.getVideo(video.id);
  broadcast({ type: "video-done", videoId: video.id, title: v.title, failedStages: failed, worstScore: v.worst_score });

  const sev = SEV_LABEL[sevKey(v.worst_score)];
  await notify(
    `<b>${v.title}</b> 처리 완료\n종합 판정: <b>${sev}</b>\n` +
    `방영불가 ${v.counts.block || 0} · 경고 ${v.counts.warn || 0} · 주의 ${v.counts.caution || 0}` +
    (failed.length ? `\n⚠ 실패 단계: ${failed.join(", ")} (나머지 완료)` : ""));
}
```

- [ ] **Step 8: 전체 테스트 통과 확인 + Commit** — `feat(server): pipeline stages + orchestration + SSE + notify`

---

### Task 8: 검색 4모드 — 병합 로직 TDD

**Files:**
- Create: `server/src/search.js`
- Test: `server/test/search.test.js`

- [ ] **Step 1: 실패 테스트 — 점수 병합(순수 함수)**

```js
// server/test/search.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { mergeResults, cosine } from "../src/search.js";

test("cosine 유사도", () => {
  assert.ok(Math.abs(cosine(new Float32Array([1, 0]), new Float32Array([1, 0])) - 1) < 1e-6);
  assert.ok(Math.abs(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))) < 1e-6);
});

test("mergeResults: 양쪽 매칭 → both, 점수 병합·정렬", () => {
  const kw = [{ video_id: "v1", t: 10, content: "한강 야경", scoreK: 0.9 }];
  const vec = [
    { video_id: "v1", t: 10, text: "한강 야경", scoreV: 0.8 },
    { video_id: "v2", t: 5, text: "강변 골목", scoreV: 0.7 },
  ];
  const out = mergeResults(kw, vec, "hybrid");
  assert.equal(out[0].source, "both");
  assert.equal(out[0].vid, "v1");
  assert.equal(out[1].source, "vector");
  assert.equal(out[1].scoreK, 0);
});

test("mergeResults: keyword 모드는 vector 전용 결과 제외", () => {
  const out = mergeResults([], [{ video_id: "v2", t: 5, text: "x", scoreV: 0.7 }], "keyword");
  assert.equal(out.length, 0);
});
```

- [ ] **Step 2: 실패 확인**
- [ ] **Step 3: search.js 구현**

```js
// server/src/search.js
import { embed } from "./openai.js";

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// kw: [{video_id,t,content,scoreK}] · vec: [{video_id,t,text,scoreV}]
export function mergeResults(kw, vec, mode) {
  const key = (r) => `${r.video_id}@${Math.round(r.t / 5) * 5}`; // 5초 버킷으로 동일 장면 병합
  const map = new Map();
  for (const r of kw) map.set(key(r), { vid: r.video_id, t: r.t, text: r.content, scoreK: r.scoreK, scoreV: 0, source: "keyword" });
  for (const r of vec) {
    const k = key(r);
    if (map.has(k)) { const m = map.get(k); m.scoreV = r.scoreV; m.source = "both"; }
    else map.set(k, { vid: r.video_id, t: r.t, text: r.text, scoreK: 0, scoreV: r.scoreV, source: "vector" });
  }
  let out = [...map.values()];
  if (mode === "keyword") out = out.filter(r => r.source !== "vector").sort((a, b) => b.scoreK - a.scoreK);
  else if (mode === "vector") out = out.sort((a, b) => b.scoreV - a.scoreV);
  else out = out.sort((a, b) => (b.scoreK + b.scoreV) - (a.scoreK + a.scoreV));
  return out.slice(0, 12);
}

export async function search(db, q, mode) {
  // filter 모드: 제목·프로그램 단순 매칭 (PRD: 날짜·카테고리 등 조건)
  if (mode === "filter") {
    return db.listVideos().filter(v => v.title.includes(q) || v.program.includes(q) || (v.uploaded_at || "").includes(q))
      .map(v => ({ vid: v.id, t: 0, text: `${v.program} · ${v.uploaded_at}`, scoreK: 1, scoreV: 0, source: "keyword",
        reason: `조건 일치: 제목/프로그램/업로드일에 '${q}' 포함` }));
  }
  const ftsQ = q.split(/\s+/).filter(Boolean).map(w => `"${w.replace(/"/g, "")}"`).join(" OR ");
  const kw = (mode !== "vector" && ftsQ) ? db.searchKeyword(ftsQ).map(r => ({ ...r, scoreK: 1 / (1 + Math.max(0, r.rank)) })) : [];
  let vec = [];
  if (mode !== "keyword") {
    const [qv] = await embed([q]);
    vec = db.allEmbeddings().map(e => ({ ...e, scoreV: cosine(qv, e.vector) }))
      .sort((a, b) => b.scoreV - a.scoreV).slice(0, 20).filter(e => e.scoreV > 0.2);
  }
  const merged = mergeResults(kw, vec, mode);
  return merged.map(r => ({ ...r, reason: reasonOf(r, q) }));
}

function reasonOf(r, q) {
  if (r.source === "both") return `'${q}' 키워드 일치 + 의미 유사 (${r.scoreV.toFixed(2)})`;
  if (r.source === "keyword") return `자막/장면 설명에 키워드 직접 등장`;
  return `직접 언급은 없으나 의미상 근접 (${r.scoreV.toFixed(2)})`;
}
```

- [ ] **Step 4: 통과 확인** — 3 pass, Commit — `feat(server): 4-mode search with score merge (TDD)`

---

### Task 9: REST API 라우트

**Files:**
- Modify: `server/src/index.js`
- Create: `server/src/routes.js`

- [ ] **Step 1: routes.js**

```js
// server/src/routes.js
import express from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "./config.js";
import { sseHandler } from "./events.js";
import { processVideo } from "./pipeline/run.js";
import { search } from "./search.js";

export function makeRouter(db) {
  const r = express.Router();
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const id = "v-" + crypto.randomBytes(4).toString("hex");
      file._vid = id;
      const dir = path.join(config.uploadsDir, id);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, "source" + path.extname(file.originalname)),
  });
  const upload = multer({ storage, limits: { fileSize: 20 * 1024 ** 3 } });

  r.post("/videos", upload.array("files"), (req, res) => {
    const created = [];
    for (const f of req.files) {
      const id = f._vid;
      const title = Buffer.from(path.parse(f.originalname).name, "latin1").toString("utf8"); // 한글 파일명 복원
      db.createVideo({ id, title, file: f.originalname, size: f.size,
        uploadedAt: new Date().toISOString().slice(0, 16).replace("T", " ") });
      created.push({ id, title });
      processVideo(db, { id, title }, f.path, config.framesDir)
        .catch(e => { db.updateVideo(id, { status: "error", error: String(e) }); });
    }
    res.status(201).json(created);
  });

  r.get("/videos", (_req, res) => {
    const rows = db.listVideos().map(v => ({
      id: v.id, title: v.title, program: v.program, file: v.file,
      size: fmtSize(v.size), duration: v.duration, uploadedAt: v.uploaded_at,
      status: v.status, captionSource: v.caption_source, worstScore: v.worst_score,
      counts: { block: v.counts.block || 0, warn: v.counts.warn || 0, caution: v.counts.caution || 0 },
      topCategory: v.top_category,
      stages: db.getStages(v.id),
      thumb: firstFrame(v.id),
    }));
    res.json(rows);
  });

  r.get("/videos/:id/report", (req, res) => {
    const rep = db.getReport(req.params.id);
    if (!rep.video) return res.status(404).json({ error: "not found" });
    const v = rep.video;
    res.json({
      id: v.id,
      meta: { title: v.title, file: v.file, size: fmtSize(v.size), duration: v.duration,
        resolution: v.resolution, uploadedAt: v.uploaded_at, processedAt: v.processed_at,
        captionSource: v.caption_source },
      timeline: rep.timeline,
      flags: rep.flags.map(f => ({ t: f.t, cat: f.cat, score: f.score, group: f.group_n,
        desc: f.desc, audio: f.audio, basis: f.basis, frames: f.frame_paths })),
      tech: rep.tech.map(t => ({ kind: t.kind, range: `${tcStr(t.start)} – ${tcStr(t.end)}`, note: t.note })),
      scenes: rep.scenes.map(s => ({ t: s.t, desc: s.desc, frame: s.frame_path })),
      corrections: rep.corrections,
      captions: rep.captions.map(c => ({ t: c.t, text: c.text })),
    });
  });

  r.get("/videos/:id/report.json", (req, res) =>
    res.download(path.join(config.uploadsDir, req.params.id, "report.json")));
  r.get("/videos/:id/violations.csv", (req, res) =>
    res.download(path.join(config.uploadsDir, req.params.id, "violations.csv")));

  r.delete("/videos/:id", (req, res) => {
    const v = db.getVideo(req.params.id);
    if (!v) return res.status(404).json({ error: "not found" });
    if (v.status === "processing") return res.status(409).json({ error: "처리 중인 영상은 삭제할 수 없습니다" });
    db.deleteVideoCascade(v.id);
    fs.rmSync(path.join(config.uploadsDir, v.id), { recursive: true, force: true });
    fs.rmSync(path.join(config.framesDir, v.id), { recursive: true, force: true });
    res.json({ deleted: v.id, title: v.title });
  });

  r.get("/search", async (req, res) => {
    const { q = "", mode = "hybrid" } = req.query;
    if (!q.trim()) return res.json([]);
    const out = await search(db, q.trim(), mode);
    const vids = Object.fromEntries(db.listVideos().map(v => [v.id, v]));
    res.json(out.filter(x => vids[x.vid]).map(x => ({
      video: vids[x.vid].title, vid: x.vid, t: x.t, source: x.source,
      reason: x.reason, scoreK: round2(x.scoreK), scoreV: round2(x.scoreV),
      scene: x.text, frame: nearestFrame(x.vid, x.t),
    })));
  });

  r.get("/events", sseHandler);

  function firstFrame(vid) {
    const dir = path.join(config.framesDir, vid, "s");
    if (!fs.existsSync(dir)) return null;
    const f = fs.readdirSync(dir).sort()[0];
    return f ? `/frames/${vid}/s/${f}` : null;
  }
  function nearestFrame(vid, t) {
    const n = Math.max(1, Math.round(t / config.sampleInterval) + 1);
    const p = path.join(config.framesDir, vid, "s", `f-${String(n).padStart(5, "0")}.jpg`);
    return fs.existsSync(p) ? `/frames/${vid}/s/${path.basename(p)}` : firstFrame(vid);
  }
  return r;
}

const round2 = (x) => Math.round((x || 0) * 100) / 100;
const fmtSize = (b) => b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + " GB" : Math.round(b / 1024 ** 2) + " MB";
const tcStr = (sec) => {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
};
```

- [ ] **Step 2: index.js 에 연결 + 재시작 복구**

```js
// index.js 수정 — health 아래에 추가
import { openDb } from "./db.js";
import { makeRouter } from "./routes.js";
const db = openDb(config.dbPath);
// 서버 재시작 시 processing 으로 남은 영상 → error 처리 (작업 재개는 범위 밖)
for (const v of db.listVideos()) if (v.status === "processing")
  db.updateVideo(v.id, { status: "error", error: "서버 재시작으로 처리 중단" });
app.use("/api", makeRouter(db));
```

- [ ] **Step 3: 수동 스모크** — 서버 기동, `curl http://localhost:3001/api/videos` → `[]`
- [ ] **Step 4: Commit** — `feat(server): REST API + SSE + restart recovery`

---

### Task 10: 프론트엔드 실데이터 연동

**Files:**
- Create: `archive-review/src/api.js`
- Modify: `archive-review/vite.config.js` (proxy), `src/data.js` (목 제거, 상수만 유지),
  `src/app.jsx` (SSE 구독·전역 토스트), `src/dashboard.jsx`, `src/upload.jsx`, `src/search.jsx`,
  `src/report.jsx`, `src/report-info.jsx`, `src/ui.jsx` (Thumb 에 src 폴백)

- [ ] **Step 1: vite proxy**

```js
// vite.config.js
export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3001", "/frames": "http://localhost:3001" } },
});
```

- [ ] **Step 2: api.js**

```js
// archive-review/src/api.js
async function j(res) { if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText); return res.json(); }
export const fetchVideos = () => fetch("/api/videos").then(j);
export const fetchReport = (id) => fetch(`/api/videos/${id}/report`).then(j);
export const searchApi = (q, mode) => fetch(`/api/search?q=${encodeURIComponent(q)}&mode=${mode}`).then(j);
export const deleteVideo = (id) => fetch(`/api/videos/${id}`, { method: "DELETE" }).then(j);
export function uploadFiles(files) {
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  return fetch("/api/videos", { method: "POST", body: fd }).then(j);
}
export function subscribeEvents(onEvent) {
  const es = new EventSource("/api/events");
  es.onmessage = (e) => onEvent(JSON.parse(e.data));
  return () => es.close();
}
```

- [ ] **Step 3: data.js 정리** — `VIDEOS/REPORT/SEARCH_QUERY/SEARCH_RESULTS` 삭제, `CATEGORIES/severityOf/SEARCH_MODES/tc` 만 유지. import 하던 곳 전부 수정.

- [ ] **Step 4: ui.jsx — Thumb 에 실프레임**

```jsx
// Thumb({ t, sev, cat, play, style, src }) — src 있으면 <img>, 없으면 기존 플레이스홀더
export function Thumb({ t, sev, cat, play, style, src }) {
  const [err, setErr] = React.useState(false);
  /* 기존 코드 유지하되 .thumb 안 맨 앞에: */
  // {src && !err && <img src={src} onError={() => setErr(true)}
  //   style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />}
}
```
(함수형 import `useState` 사용. 자세한 구현은 기존 컴포넌트 구조 유지.)

- [ ] **Step 5: dashboard.jsx** — `useEffect`로 `fetchVideos()`; 로딩 중 빈 상태 문구("아직 업로드된 영상이 없습니다"); 통계는 응답으로 계산; `status!=="done"` 행은 `처리 중` 배지 + 클릭 무시; `Thumb src={v.thumb}` 전달; `duration`은 `tc()`로 표시.

- [ ] **Step 6: upload.jsx** — 시뮬레이션 제거하고 실제 흐름:
  - `addJob` → 파일 input(`<input type="file" multiple accept="video/*">`)/드롭으로 `uploadFiles(files)` 호출
  - 업로드 직후 `fetchVideos()`로 `processing` 영상의 stages 를 받아 카드 초기화
  - `subscribeEvents`로 `{type:"stage", videoId, key, progress, status, error}` 수신 → 해당 카드의 단계 갱신 (단계 키·그룹 매핑은 기존 `STAGES_DEF`의 key/label/group 그대로: extract/correct=언어, scene/tech/index=분석, sample/judge/verdict=검수)
  - `{type:"video-done"}` 수신 → 카드 완료 상태 + "리포트 보기" 버튼이 해당 `videoId`의 리포트로 이동
  - 페이지 진입 시 기존 `processing` 영상 카드 복원 (`stages` 응답)

- [ ] **Step 7: search.jsx** — `searchApi(q, mode)` 호출(검색 버튼/Enter, 모드 변경 시 재호출), 결과의 `frame`을 `Thumb src`로, `scoreK/scoreV/reason/source` 그대로 렌더. 빈 질의는 호출 안 함.

- [ ] **Step 8: report.jsx + report-info.jsx** — `route.id`로 `fetchReport(id)`; `REPORT` 전역 제거; 플래그 `frames` 배열을 FlagModal 연속 묶음에, `frame`을 카드 Thumb 에; 다운로드 버튼 → `/api/videos/:id/report.json`, `/violations.csv` 링크(`<a download>`); 삭제 확인 → `deleteVideo(id)` 성공 시 대시보드 이동+토스트, 409 면 오류 토스트.

- [ ] **Step 9: app.jsx** — 전역 `subscribeEvents`: `video-done` → 텔레그램 토스트(기존 Toast 재사용, `err: failedStages.length>0`); 업로드 뷰 nav 배지 = 처리 중 영상 수(`fetchVideos` 주기 갱신 대신 SSE 이벤트로 갱신).

- [ ] **Step 10: 빌드 확인** — `npm run build --prefix archive-review` → exit 0
- [ ] **Step 11: Commit** — `feat(web): wire UI to backend (upload/SSE/search/report/delete)`

---

### Task 11: E2E 검증 (실제 OpenAI 호출 — 소형 영상)

**Files:**
- Create: `server/test/e2e.manual.js` (node:test 제외 — `node server/test/e2e.manual.js`로 수동 실행)

- [ ] **Step 1: 합성 테스트 영상 생성 스크립트 포함** — ffmpeg lavfi 로 20초 영상(테스트 패턴+사인음, 중간 3초 무음+블랙):

```js
// e2e.manual.js 도입부
import { run } from "../src/ffmpeg.js";
const SAMPLE = "server/data/e2e-sample.mp4";
await run("ffmpeg", ["-y",
  "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=20",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
  "-vf", "drawbox=enable='between(t,8,11)':color=black:t=fill",
  "-af", "volume=enable='between(t,8,11)':volume=0",
  "-pix_fmt", "yuv420p", SAMPLE]);
```

- [ ] **Step 2: 시나리오** — fetch 로 서버에 대해:
  1. `POST /api/videos` (FormData, 위 샘플) → 201, id 획득
  2. `GET /api/videos` 폴링 (2초 간격, 최대 5분) → `status==="done"`
  3. `GET /api/videos/:id/report` → meta.duration≈20, tech 에 무음·블랙 구간 존재 assert
  4. `GET /api/search?q=테스트 패턴&mode=hybrid` → 배열 응답 (결과 유무는 로그만)
  5. `GET /api/videos/:id/violations.csv` → 200
  6. `DELETE /api/videos/:id` → 200, 재조회 시 404
  각 단계 console.log 로 PASS/FAIL 출력, 실패 시 exit 1.

- [ ] **Step 3: 실행** — 서버 기동 상태에서 `node server/test/e2e.manual.js` → 전체 PASS
  (Whisper 는 사인음에서 빈 자막을 반환할 수 있음 — captions 빈 배열 허용)
- [ ] **Step 4: 브라우저 확인** — `npm run dev --prefix archive-review` + 서버 기동, Playwright 로 대시보드/업로드/검색/리포트 클릭스루, 콘솔 에러 0 확인
- [ ] **Step 5: Commit** — `test(server): e2e manual scenario + synthetic sample`

---

### Task 12: 마무리

- [ ] **Step 1: README.md** — 프로젝트 루트에 실행 방법(서버 `npm start --prefix server`, 웹 `npm run dev --prefix archive-review`), .env 키 목록, 비용 파라미터 설명.
- [ ] **Step 2: 전체 테스트 1회** — `npm test --prefix server` 전부 PASS + `npm run build --prefix archive-review` exit 0
- [ ] **Step 3: 최종 Commit**

---

## Self-Review 결과

- **스펙 커버리지**: 업로드(T9)·자동분석 5종(T7)·검색 4모드(T8)·금칙검수 연속묶음(T7 judge)·심각도/타임라인(T6)·알림(T4/T7)·삭제 캐스케이드(T2/T9)·SSE(T7/T9)·영속성+재시작 복구(T9)·규칙 외부화(T5)·산출물 4종(T5/T6/T7)·프론트 연동(T10)·보안 .env(T1) — 전부 매핑됨.
- **단순화 명시**: judge soft-start 미구현(헤더에 기록), filter 모드는 제목/프로그램/날짜 단순 매칭.
- **타입 일관성**: 단계 키(extract/correct/scene/tech/index/sample/judge/verdict)가 UI `STAGES_DEF`·DB stages·SSE 이벤트에서 동일. severityOf 임계값(서버 sevKey)과 프론트 동일(4+/3/1+/0).
