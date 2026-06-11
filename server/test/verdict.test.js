import test from "node:test";
import assert from "node:assert/strict";
import { aggregate, buildTimeline, toCsv } from "../src/pipeline/verdict.js";

test("aggregate: worst/counts/topCategory", () => {
  const flags = [
    { t: 10, cat: "폭력", score: 4 }, { t: 20, cat: "폭력", score: 3 },
    { t: 30, cat: "성표현", score: 2 }, { t: 40, cat: "광고저작권", score: 1 },
  ];
  const a = aggregate(flags);
  assert.equal(a.worstScore, 4);
  assert.deepEqual(a.counts, { block: 1, warn: 1, caution: 2 });
  assert.equal(a.topCategory, "폭력");
});

test("aggregate: 플래그 없음 → 통과", () => {
  assert.deepEqual(aggregate([]), { worstScore: 0, counts: { block: 0, warn: 0, caution: 0 }, topCategory: null });
});

test("buildTimeline: 위반>검토필요>무음 우선순위로 ok 위에 오버레이", () => {
  const segs = buildTimeline(100,
    [{ t: 50, score: 4, groupN: 3 }, { t: 70, score: 3, groupN: 2 }],
    [{ kind: "무음", start: 10, end: 20 }], 1);
  assert.equal(segs[0].start, 0);
  assert.equal(segs.at(-1).end, 100);
  for (let i = 1; i < segs.length; i++) assert.equal(segs[i].start, segs[i - 1].end);
  assert.ok(segs.some(s => s.kind === "violation" && s.start === 50));
  assert.ok(segs.some(s => s.kind === "review" && s.start === 70));
  assert.ok(segs.some(s => s.kind === "silence" && s.start === 10));
});

test("toCsv: 위반 목록 CSV", () => {
  const csv = toCsv([{ t: 614, cat: "폭력", score: 4, desc: '몸싸움, "심한" 장면' }]);
  assert.match(csv, /^t,category,score,severity,desc/);
  assert.match(csv, /614,폭력,4,방영불가,"몸싸움, ""심한"" 장면"/);
});
