// server/src/telegram.js — 처리 완료 알림
import { config } from "./config.js";

export async function notify(text) {
  if (!config.telegramToken || !config.telegramChatId) return { ok: false, skipped: true };
  try {
    const r = await fetch(`https://api.telegram.org/bot${config.telegramToken}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: config.telegramChatId, text, parse_mode: "HTML" }),
    });
    return await r.json();
  } catch (e) { return { ok: false, error: String(e) }; }
}
