// server/src/openai.js — OpenAI 호출 공통 (재시도 포함)
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
