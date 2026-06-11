// server/src/ffmpeg.js — ffmpeg/ffprobe CLI 래퍼 + 로그/자막 파서
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function run(bin, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { windowsHide: true });
    let out = "", err = "";
    p.stdout.on("data", c => out += c);
    p.stderr.on("data", c => err += c);
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve({ out, err }) : reject(new Error(`${bin} exit ${code}: ${err.slice(-400)}`)));
  });
}

export async function probe(file) {
  const { out } = await run("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", file]);
  const info = JSON.parse(out);
  const v = (info.streams || []).find(s => s.codec_type === "video") || {};
  const fps = v.avg_frame_rate?.includes("/") ? (([a, b]) => b > 0 ? String(Math.round(a / b * 1000) / 1000) : "?")(v.avg_frame_rate.split("/").map(Number)) : "?";
  return {
    duration: Number(info.format?.duration || 0),
    resolution: v.width ? `${v.width}×${v.height} · ${fps}fps` : "",
    hasSubtitles: (info.streams || []).some(s => s.codec_type === "subtitle"),
  };
}

// 내장 자막 추출 — 트랙 없으면 null
export async function extractSubtitles(file, outDir) {
  const srtPath = path.join(outDir, "subs.srt");
  try {
    await run("ffmpeg", ["-y", "-i", file, "-map", "0:s:0", srtPath]);
    return fs.existsSync(srtPath) && fs.statSync(srtPath).size > 0 ? fs.readFileSync(srtPath, "utf8") : null;
  } catch { return null; }
}

export async function extractAudio(file, outDir) {
  const wav = path.join(outDir, "audio.wav");
  await run("ffmpeg", ["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", wav]);
  return wav;
}

// t초 지점 프레임 1장 추출
export async function frameAt(file, t, outPath, height = 270) {
  await run("ffmpeg", ["-y", "-ss", String(t), "-i", file, "-frames:v", "1", "-vf", `scale=-2:${height}`, "-q:v", "5", outPath]);
  return outPath;
}

// interval초 간격 연속 프레임 → [{t, path}]
export async function sampleFrames(file, outDir, interval) {
  fs.mkdirSync(outDir, { recursive: true });
  await run("ffmpeg", ["-y", "-i", file, "-vf", `fps=1/${interval},scale=-2:270`, "-q:v", "5", path.join(outDir, "f-%05d.jpg")]);
  return fs.readdirSync(outDir).filter(f => f.startsWith("f-")).sort()
    .map((f, i) => ({ t: i * interval, path: path.join(outDir, f) }));
}

export async function detectTech(file) {
  // -f null: 디코드만 수행, 필터 로그는 stderr 로
  const args = ["-i", file, "-vf", "blackdetect=d=1:pix_th=0.10,freezedetect=n=-60dB:d=2",
    "-af", "silencedetect=noise=-35dB:d=2", "-f", "null", "-"];
  const { err } = await run("ffmpeg", args);
  return parseTechStderr(err);
}

export function parseTechStderr(stderr) {
  const out = [];
  let silStart = null, frzStart = null;
  for (const line of stderr.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/silence_start: ([\d.]+)/))) silStart = Number(m[1]);
    else if ((m = line.match(/silence_end: ([\d.]+)/)) && silStart != null) {
      out.push({ kind: "무음", start: silStart, end: Number(m[1]) }); silStart = null;
    } else if ((m = line.match(/black_start:([\d.]+) black_end:([\d.]+)/)))
      out.push({ kind: "블랙", start: Number(m[1]), end: Number(m[2]) });
    else if ((m = line.match(/freeze_start: ([\d.]+)/))) frzStart = Number(m[1]);
    else if ((m = line.match(/freeze_end: ([\d.]+)/)) && frzStart != null) {
      out.push({ kind: "프리즈", start: frzStart, end: Number(m[1]) }); frzStart = null;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function parseSrt(srt) {
  const blocks = srt.replace(/\r/g, "").split(/\n\n+/).filter(b => b.trim());
  const rows = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const ti = lines.findIndex(l => l.includes("-->"));
    if (ti < 0) continue;
    const m = lines[ti].match(/(\d+):(\d+):(\d+)[,.](\d+)/);
    if (!m) continue;
    const t = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000;
    const text = lines.slice(ti + 1).join(" ").replace(/<[^>]+>/g, "").trim();
    if (text) rows.push({ t, text });
  }
  return rows;
}
