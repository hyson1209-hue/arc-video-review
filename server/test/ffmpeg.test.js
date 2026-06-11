import test from "node:test";
import assert from "node:assert/strict";
import { parseTechStderr, parseSrt } from "../src/ffmpeg.js";

test("silencedetect/blackdetect/freezedetect stderr 를 구간으로 파싱", () => {
  const stderr = [
    "[silencedetect @ 0x1] silence_start: 3.0",
    "[silencedetect @ 0x1] silence_end: 15.2 | silence_duration: 12.2",
    "[blackdetect @ 0x2] black_start:0 black_end:4.1 black_duration:4.1",
    "[freezedetect @ 0x3] lavfi.freezedetect.freeze_start: 130.8",
    "[freezedetect @ 0x3] lavfi.freezedetect.freeze_end: 132.9",
  ].join("\n");
  const out = parseTechStderr(stderr);
  assert.deepEqual(out, [
    { kind: "블랙", start: 0, end: 4.1 },
    { kind: "무음", start: 3.0, end: 15.2 },
    { kind: "프리즈", start: 130.8, end: 132.9 },
  ]);
});

test("SRT 파싱 → {t, text}", () => {
  const srt = "1\n00:00:01,000 --> 00:00:03,000\n안녕하세요\n\n2\n00:01:02,500 --> 00:01:04,000\n반갑습니다\n줄바꿈\n";
  assert.deepEqual(parseSrt(srt), [
    { t: 1, text: "안녕하세요" },
    { t: 62.5, text: "반갑습니다 줄바꿈" },
  ]);
});
