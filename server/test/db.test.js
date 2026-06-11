import test from "node:test";
import assert from "node:assert/strict";
import { openDb } from "../src/db.js";

function mem() { return openDb(":memory:"); }

test("createVideo → listVideos 에 나타난다", () => {
  const db = mem();
  db.createVideo({ id: "v1", title: "테스트", file: "t.mp4", size: 1000, uploadedAt: "2026-06-11 10:00" });
  const rows = db.listVideos();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "processing");
});

test("deleteVideoCascade 는 모든 연관 행을 지운다", () => {
  const db = mem();
  db.createVideo({ id: "v1", title: "t", file: "t.mp4", size: 1, uploadedAt: "x" });
  db.insertCaptions("v1", [{ t: 1, text: "안녕 한강" }]);
  db.insertFlag("v1", { t: 5, cat: "폭력", score: 4, groupN: 3, desc: "d", audio: "—", basis: "b", framePaths: [] });
  db.insertEmbedding("v1", { t: 1, kind: "caption", text: "안녕 한강", vector: new Float32Array([0.1, 0.2]) });
  db.rebuildFts("v1");
  db.deleteVideoCascade("v1");
  assert.equal(db.listVideos().length, 0);
  assert.equal(db.searchKeyword("한강").length, 0);
  assert.equal(db.allEmbeddings().length, 0);
});

test("getReport 는 리포트 구성요소를 모두 합친다", () => {
  const db = mem();
  db.createVideo({ id: "v1", title: "t", file: "t.mp4", size: 1, uploadedAt: "x" });
  db.insertCaptions("v1", [{ t: 1, text: "a", corrected: 1, beforeText: "b" }]);
  db.insertTimeline("v1", [{ start: 0, end: 10, kind: "ok" }]);
  const r = db.getReport("v1");
  assert.equal(r.captions.length, 1);
  assert.equal(r.corrections.length, 1);
  assert.equal(r.timeline.length, 1);
});
