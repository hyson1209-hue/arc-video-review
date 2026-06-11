import test from "node:test";
import assert from "node:assert/strict";
import { mergeResults, cosine } from "../src/search.js";

test("cosine 유사도", () => {
  assert.ok(Math.abs(cosine(new Float32Array([1, 0]), new Float32Array([1, 0])) - 1) < 1e-6);
  assert.ok(Math.abs(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))) < 1e-6);
});

test("mergeResults: 양쪽 매칭 → both, 점수 병합·정렬", () => {
  const kw = [{ video_id: "v1", t: 10, content: "한강 야경", scoreK: 0.9 }];
  const vec = [
    { video_id: "v1", t: 10, text: "한강 야경", scoreV: 0.8 },
    { video_id: "v2", t: 5, text: "강변 골목", scoreV: 0.7 },
  ];
  const out = mergeResults(kw, vec, "hybrid");
  assert.equal(out[0].source, "both");
  assert.equal(out[0].vid, "v1");
  assert.equal(out[1].source, "vector");
  assert.equal(out[1].scoreK, 0);
});

test("mergeResults: keyword 모드는 vector 전용 결과 제외", () => {
  const out = mergeResults([], [{ video_id: "v2", t: 5, text: "x", scoreV: 0.7 }], "keyword");
  assert.equal(out.length, 0);
});
