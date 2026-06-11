// server/src/routes.js — REST API (UI 화면과 1:1)
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
    for (const f of req.files || []) {
      const id = f._vid;
      // multer 는 파일명을 latin1 로 줄 수 있음 → 한글 복원
      const original = Buffer.from(f.originalname, "latin1").toString("utf8");
      const title = path.parse(original).name;
      db.createVideo({ id, title, file: original, size: f.size,
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
    try {
      const { q = "", mode = "hybrid" } = req.query;
      if (!String(q).trim()) return res.json([]);
      const out = await search(db, String(q).trim(), String(mode));
      const vids = Object.fromEntries(db.listVideos().map(v => [v.id, v]));
      res.json(out.filter(x => vids[x.vid]).map(x => ({
        video: vids[x.vid].title, vid: x.vid, t: x.t, source: x.source,
        reason: x.reason, scoreK: round2(x.scoreK), scoreV: round2(x.scoreV),
        scene: x.text, frame: nearestFrame(x.vid, x.t),
      })));
    } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
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
