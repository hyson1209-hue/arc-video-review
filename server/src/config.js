// server/src/config.js — 환경 로드·검증·경로 상수
// ARC_* 환경변수는 Electron 패키징 등에서 경로를 외부 주입할 때 사용한다.
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
dotenv.config({ path: process.env.ARC_ENV_PATH || path.join(ROOT, ".env") });

const dataDir = process.env.ARC_DATA_DIR || path.join(ROOT, "server", "data");

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
  dataDir,
  uploadsDir: path.join(dataDir, "uploads"),
  framesDir: path.join(dataDir, "frames"),
  dbPath: path.join(dataDir, "arc.db"),
  rulesPath: process.env.ARC_RULES_PATH || path.join(ROOT, "server", "rules", "금칙기준.md"),
  webDist: process.env.ARC_WEB_DIST || path.join(ROOT, "archive-review", "dist"),
};
if (!config.openaiKey) console.warn("[config] OPENAI_API_KEY 없음 — AI 단계는 실패 처리됩니다");
