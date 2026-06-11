// server/src/index.js — Express 앱 진입점
import express from "express";
import fs from "node:fs";
import { config } from "./config.js";
import { openDb } from "./db.js";
import { makeRouter } from "./routes.js";

for (const d of [config.dataDir, config.uploadsDir, config.framesDir]) fs.mkdirSync(d, { recursive: true });

const db = openDb(config.dbPath);
// 서버 재시작 시 processing 으로 남은 영상 → error 처리 (작업 재개는 v1 범위 밖)
for (const v of db.listVideos()) if (v.status === "processing")
  db.updateVideo(v.id, { status: "error", error: "서버 재시작으로 처리 중단" });

const app = express();
app.use(express.json());
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.use("/api", makeRouter(db));
app.use("/frames", express.static(config.framesDir));

app.listen(config.port, () => console.log(`[arc] http://localhost:${config.port}`));
export { app };
