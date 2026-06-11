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
// 프론트 프로덕션 빌드가 있으면 함께 서빙 (Vite dev 서버 없이 단일 포트 운영)
if (fs.existsSync(config.webDist)) app.use(express.static(config.webDist));

app.listen(config.port, () => console.log(`[arc] http://localhost:${config.port}`));
export { app };
