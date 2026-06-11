// scripts/e2e.js — 실제 OpenAI 호출 포함 전체 흐름 1바퀴 (수동 실행: node scripts/e2e.js)
// 합성 영상 생성 → 업로드 → 처리 완료 폴링 → 리포트 검증 → 검색 → CSV → 삭제
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../src/ffmpeg.js";

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = "http://localhost:3001";
const SAMPLE = path.join(SERVER_DIR, "data", "e2e-sample.mp4");

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// 1) 합성 테스트 영상: 20초 testsrc + 사인음, 8~11초 블랙 + 무음
console.log("[e2e] 합성 영상 생성");
await run("ffmpeg", ["-y",
  "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=20",
  "-f", "lavfi", "-i", "sine=frequency=440:duration=20",
  "-vf", "drawbox=enable='between(t,8,11)':color=black:t=fill",
  "-af", "volume=enable='between(t,8,11)':volume=0",
  "-pix_fmt", "yuv420p", "-shortest", SAMPLE]);

// 2) 서버 기동 (이미 떠 있으면 그대로 사용)
let child = null;
const up = await fetch(`${BASE}/api/health`).then(r => r.ok).catch(() => false);
if (!up) {
  console.log("[e2e] 서버 기동");
  child = spawn(process.execPath, ["src/index.js"], { cwd: SERVER_DIR, stdio: "inherit", windowsHide: true });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    if (await fetch(`${BASE}/api/health`).then(r => r.ok).catch(() => false)) break;
  }
}

try {
  // 3) 업로드
  const fd = new FormData();
  fd.append("files", new Blob([fs.readFileSync(SAMPLE)], { type: "video/mp4" }), "e2e-sample.mp4");
  const createdRes = await fetch(`${BASE}/api/videos`, { method: "POST", body: fd });
  ok("POST /api/videos → 201", createdRes.status === 201);
  const [created] = await createdRes.json();
  console.log(`[e2e] 업로드됨: ${created.id}`);

  // 4) 처리 완료 폴링 (최대 5분)
  let video = null;
  for (let i = 0; i < 150; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const vids = await fetch(`${BASE}/api/videos`).then(r => r.json());
    video = vids.find(v => v.id === created.id);
    if (video?.status !== "processing") break;
    if (i % 5 === 0) console.log(`[e2e] 처리 중… stages=${(video.stages || []).map(s => `${s.key}:${s.status}`).join(",")}`);
  }
  ok("처리 완료 (status=done)", video?.status === "done", `status=${video?.status}`);

  // 5) 리포트 검증
  const rep = await fetch(`${BASE}/api/videos/${created.id}/report`).then(r => r.json());
  ok("meta.duration ≈ 20초", Math.abs((rep.meta?.duration || 0) - 20) < 1.5, `duration=${rep.meta?.duration}`);
  ok("기술 검토에 무음 구간", rep.tech?.some(t => t.kind === "무음"), JSON.stringify(rep.tech));
  ok("기술 검토에 블랙 구간", rep.tech?.some(t => t.kind === "블랙"), JSON.stringify(rep.tech));
  ok("타임라인 존재", (rep.timeline?.length || 0) > 0);
  ok("장면 분석 존재", (rep.scenes?.length || 0) > 0);
  console.log(`[e2e] 자막 ${rep.captions?.length || 0}건 · 플래그 ${rep.flags?.length || 0}건 (테스트 패턴이라 0이어도 정상)`);

  // 6) 검색 (hybrid)
  const sr = await fetch(`${BASE}/api/search?q=${encodeURIComponent("컬러 바 테스트 패턴")}&mode=hybrid`);
  ok("GET /api/search → 200 배열", sr.ok && Array.isArray(await sr.json()));

  // 7) 산출물 다운로드
  const csv = await fetch(`${BASE}/api/videos/${created.id}/violations.csv`);
  ok("violations.csv → 200", csv.ok);
  const rj = await fetch(`${BASE}/api/videos/${created.id}/report.json`);
  ok("report.json → 200", rj.ok);

  // 8) 삭제 + 캐스케이드 확인
  const del = await fetch(`${BASE}/api/videos/${created.id}`, { method: "DELETE" });
  ok("DELETE → 200", del.ok);
  const after = await fetch(`${BASE}/api/videos/${created.id}/report`);
  ok("삭제 후 리포트 404", after.status === 404);
} finally {
  if (child) child.kill();
  fs.rmSync(SAMPLE, { force: true });
}

console.log(`\n[e2e] PASS ${pass} · FAIL ${fail}`);
process.exit(fail ? 1 : 0);
