// server/src/index.js — Express 앱 진입점
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
