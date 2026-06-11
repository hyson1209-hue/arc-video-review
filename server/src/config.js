// server/src/config.js — 환경 로드·검증·경로 상수
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
