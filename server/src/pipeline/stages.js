// server/src/pipeline/stages.js — 영상 1편의 8단계 정의 (UI 단계 키와 1:1)
//  언어: extract → correct
//  분석: scene ∥ tech → index
//  검수: sample → judge → verdict
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import * as ff from "../ffmpeg.js";
import { chatJson, imagePart, transcribe, embed } from "../openai.js";
import { aggregate, buildTimeline, toCsv } from "./verdict.js";

const CATS = ["성표현", "폭력", "충격혐오", "유해행위", "인격권", "차별증오", "아동청소년", "광고저작권"];

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
        return;
      }
      report(30); // 자막 트랙 없음 → 음성 인식 경로
      const wav = await ff.extractAudio(ctx.srcPath, ctx.workDir);
      report(55);
      sh.captions = await transcribe(wav);
      sh.captionSource = "음성 인식 생성";
    }},

    { key: "correct", deps: ["extract"], fn: async (report) => {
      const caps = sh.captions || [];
      db.updateVideo(id, { caption_source: sh.captionSource || "" });
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
        report(Math.min(99, Math.round((i + CHUNK) / caps.length * 100)));
      }
      sh.corrected = out;
      db.insertCaptions(id, out);
    }},

    { key: "scene", deps: [], fn: async (report) => {
      const dur = sh.duration || (await ff.probe(ctx.srcPath)).duration;
      const interval = Math.min(config.sceneInterval, Math.max(5, dur / 4));
      const ts = [];
      for (let t = interval / 2; t < dur; t += interval) ts.push(Math.round(t));
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
        report(Math.min(99, 40 + Math.round((i + 64) / docs.length * 60)));
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
        JSON.stringify({ id, ...agg, flags, timeline, tech: sh.tech ?? [], generatedAt: new Date().toISOString() }, null, 2));
      sh.agg = agg;
    }},
  ];
}
