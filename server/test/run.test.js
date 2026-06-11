import test from "node:test";
import assert from "node:assert/strict";
import { runGraph } from "../src/pipeline/run.js";

test("의존 순서 보장 + 독립 단계 병렬", async () => {
  const order = [];
  const mk = (key) => async () => { order.push(key); };
  const stages = [
    { key: "a", deps: [], fn: mk("a") },
    { key: "b", deps: ["a"], fn: mk("b") },
    { key: "c", deps: [], fn: mk("c") },
    { key: "d", deps: ["b", "c"], fn: mk("d") },
  ];
  const res = await runGraph(stages, () => {});
  assert.ok(order.indexOf("a") < order.indexOf("b"));
  assert.ok(order.indexOf("b") < order.indexOf("d"));
  assert.ok(order.indexOf("c") < order.indexOf("d"));
  assert.equal(res.a.status, "done");
});

test("한 단계 실패해도 의존 단계는 계속 실행 (실패 격리)", async () => {
  const ran = [];
  const stages = [
    { key: "a", deps: [], fn: async () => { throw new Error("디코드 오류"); } },
    { key: "b", deps: ["a"], fn: async () => { ran.push("b"); } },
  ];
  const res = await runGraph(stages, () => {});
  assert.equal(res.a.status, "error");
  assert.match(res.a.error, /디코드 오류/);
  assert.equal(res.b.status, "done");
  assert.deepEqual(ran, ["b"]);
});

test("진행률 콜백이 stage 키와 함께 호출된다", async () => {
  const events = [];
  const stages = [{ key: "a", deps: [], fn: async (report) => { report(50); report(100); } }];
  await runGraph(stages, (key, progress) => events.push([key, progress]));
  assert.deepEqual(events.filter(e => e[0] === "a" && e[1] > 0).map(e => e[1]).slice(0, 2), [50, 100]);
});
