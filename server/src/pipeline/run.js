// server/src/pipeline/run.js — 의존 그래프 단계 실행기 + 영상 처리 진입점
import fs from "node:fs";
import path from "node:path";
import { buildStages } from "./stages.js";
import { broadcast } from "../events.js";
import { notify } from "../telegram.js";
import { sevKey } from "./verdict.js";

// stages: [{ key, deps: [], fn: async (reportProgress) => {} }]
// onEvent(key, progress, status, errorMsg?) — 시작/진행/완료/실패 모두 통지
export async function runGraph(stages, onEvent) {
  const state = {};
  const promises = {};
  for (const s of stages) state[s.key] = { status: "wait", progress: 0, error: null };

  const runOne = (s) => {
    promises[s.key] = (async () => {
      await Promise.all(s.deps.map(d => promises[d])); // 의존 단계 실패해도 resolve 됨 (실패 격리)
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

const SEV_LABEL = { block: "방영 불가", warn: "경고", caution: "주의", pass: "통과" };
const now = () => new Date().toISOString().slice(0, 16).replace("T", " ");

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
  db.updateVideo(video.id, { status: "done", processed_at: now() });
  const v = db.getVideo(video.id);
  broadcast({ type: "video-done", videoId: video.id, title: v.title, failedStages: failed, worstScore: v.worst_score });

  const sev = SEV_LABEL[sevKey(v.worst_score)];
  await notify(
    `<b>${v.title}</b> 처리 완료\n종합 판정: <b>${sev}</b>\n` +
    `방영불가 ${v.counts.block || 0} · 경고 ${v.counts.warn || 0} · 주의 ${v.counts.caution || 0}` +
    (failed.length ? `\n⚠ 실패 단계: ${failed.join(", ")} (나머지 완료)` : ""));
}
