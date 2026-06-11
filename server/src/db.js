// server/src/db.js — node:sqlite 기반 저장 계층 (키워드 FTS5 + 벡터 임베딩 병행)
import { DatabaseSync } from "node:sqlite";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY, title TEXT, program TEXT DEFAULT '미분류', file TEXT, size INTEGER,
  duration REAL DEFAULT 0, resolution TEXT DEFAULT '', status TEXT DEFAULT 'processing',
  caption_source TEXT DEFAULT '', uploaded_at TEXT, processed_at TEXT,
  worst_score INTEGER DEFAULT 0, counts TEXT DEFAULT '{}', top_category TEXT, error TEXT
);
CREATE TABLE IF NOT EXISTS stages (
  video_id TEXT, key TEXT, status TEXT, progress REAL DEFAULT 0, error TEXT,
  PRIMARY KEY (video_id, key)
);
CREATE TABLE IF NOT EXISTS captions (video_id TEXT, t REAL, text TEXT, corrected INTEGER DEFAULT 0, before_text TEXT);
CREATE TABLE IF NOT EXISTS scenes (video_id TEXT, t REAL, desc TEXT, frame_path TEXT);
CREATE TABLE IF NOT EXISTS tech_findings (video_id TEXT, kind TEXT, start REAL, end REAL, note TEXT);
CREATE TABLE IF NOT EXISTS flags (
  video_id TEXT, t REAL, cat TEXT, score INTEGER, group_n INTEGER,
  desc TEXT, audio TEXT, basis TEXT, frame_paths TEXT
);
CREATE TABLE IF NOT EXISTS timeline (video_id TEXT, start REAL, end REAL, kind TEXT);
CREATE TABLE IF NOT EXISTS embeddings (video_id TEXT, t REAL, kind TEXT, text TEXT, vector BLOB);
CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(video_id UNINDEXED, t UNINDEXED, kind UNINDEXED, content);
`;

export function openDb(file) {
  const d = new DatabaseSync(file);
  d.exec("PRAGMA journal_mode = WAL");
  d.exec(SCHEMA);
  const j = (x) => JSON.stringify(x);
  const tx = (fn) => { d.exec("BEGIN"); try { fn(); d.exec("COMMIT"); } catch (e) { d.exec("ROLLBACK"); throw e; } };

  return {
    raw: d,
    createVideo: (v) => {
      d.prepare(`INSERT INTO videos (id,title,file,size,uploaded_at) VALUES (?,?,?,?,?)`)
        .run(v.id, v.title, v.file, v.size, v.uploadedAt);
    },
    updateVideo: (id, fields) => {
      const keys = Object.keys(fields);
      d.prepare(`UPDATE videos SET ${keys.map(k => `${k}=?`).join(",")} WHERE id=?`)
        .run(...keys.map(k => typeof fields[k] === "object" && fields[k] !== null ? j(fields[k]) : fields[k]), id);
    },
    listVideos: () => d.prepare(`SELECT * FROM videos ORDER BY uploaded_at DESC`).all()
      .map(r => ({ ...r, counts: JSON.parse(r.counts || "{}") })),
    getVideo: (id) => {
      const r = d.prepare(`SELECT * FROM videos WHERE id=?`).get(id);
      return r ? { ...r, counts: JSON.parse(r.counts || "{}") } : null;
    },
    saveStage: (vid, key, s) => d.prepare(
      `INSERT INTO stages (video_id,key,status,progress,error) VALUES (?,?,?,?,?)
       ON CONFLICT(video_id,key) DO UPDATE SET status=excluded.status,progress=excluded.progress,error=excluded.error`
    ).run(vid, key, s.status, s.progress ?? 0, s.error ?? null),
    getStages: (vid) => d.prepare(`SELECT key,status,progress,error FROM stages WHERE video_id=?`).all(vid),
    insertCaptions: (vid, rows) => tx(() => {
      const st = d.prepare(`INSERT INTO captions VALUES (?,?,?,?,?)`);
      rows.forEach(c => st.run(vid, c.t, c.text, c.corrected ? 1 : 0, c.beforeText ?? null));
    }),
    insertScene: (vid, s) => d.prepare(`INSERT INTO scenes VALUES (?,?,?,?)`).run(vid, s.t, s.desc, s.framePath ?? null),
    insertTech: (vid, f) => d.prepare(`INSERT INTO tech_findings VALUES (?,?,?,?,?)`).run(vid, f.kind, f.start, f.end, f.note ?? ""),
    insertFlag: (vid, f) => d.prepare(`INSERT INTO flags VALUES (?,?,?,?,?,?,?,?,?)`)
      .run(vid, f.t, f.cat, f.score, f.groupN, f.desc, f.audio ?? "—", f.basis ?? "", j(f.framePaths ?? [])),
    insertTimeline: (vid, segs) => tx(() => {
      const st = d.prepare(`INSERT INTO timeline VALUES (?,?,?,?)`);
      segs.forEach(s => st.run(vid, s.start, s.end, s.kind));
    }),
    insertEmbedding: (vid, e) => d.prepare(`INSERT INTO embeddings VALUES (?,?,?,?,?)`)
      .run(vid, e.t, e.kind, e.text, new Uint8Array(e.vector.buffer, e.vector.byteOffset, e.vector.byteLength)),
    allEmbeddings: () => d.prepare(`SELECT * FROM embeddings`).all()
      .map(r => ({ ...r, vector: new Float32Array(r.vector.buffer, r.vector.byteOffset, r.vector.byteLength / 4) })),
    rebuildFts: (vid) => tx(() => {
      d.prepare(`DELETE FROM docs_fts WHERE video_id=?`).run(vid);
      const st = d.prepare(`INSERT INTO docs_fts (video_id,t,kind,content) VALUES (?,?,?,?)`);
      for (const c of d.prepare(`SELECT * FROM captions WHERE video_id=?`).all(vid)) st.run(vid, c.t, "caption", c.text);
      for (const s of d.prepare(`SELECT * FROM scenes WHERE video_id=?`).all(vid)) st.run(vid, s.t, "scene", s.desc);
    }),
    searchKeyword: (q) => d.prepare(
      `SELECT video_id, t, kind, content, bm25(docs_fts) AS rank FROM docs_fts WHERE docs_fts MATCH ? ORDER BY rank LIMIT 30`
    ).all(q),
    getReport: (vid) => ({
      video: d.prepare(`SELECT * FROM videos WHERE id=?`).get(vid),
      timeline: d.prepare(`SELECT start,end,kind FROM timeline WHERE video_id=? ORDER BY start`).all(vid),
      flags: d.prepare(`SELECT * FROM flags WHERE video_id=? ORDER BY score DESC, t`).all(vid)
        .map(f => ({ ...f, frame_paths: JSON.parse(f.frame_paths || "[]") })),
      tech: d.prepare(`SELECT kind,start,end,note FROM tech_findings WHERE video_id=? ORDER BY start`).all(vid),
      scenes: d.prepare(`SELECT t,desc,frame_path FROM scenes WHERE video_id=? ORDER BY t`).all(vid),
      captions: d.prepare(`SELECT t,text,corrected,before_text FROM captions WHERE video_id=? ORDER BY t`).all(vid),
      corrections: d.prepare(`SELECT t,before_text AS before,text AS after FROM captions WHERE video_id=? AND corrected=1 ORDER BY t`).all(vid),
    }),
    deleteVideoCascade: (vid) => tx(() => {
      for (const t of ["videos", "stages", "captions", "scenes", "tech_findings", "flags", "timeline", "embeddings"])
        d.prepare(`DELETE FROM ${t} WHERE ${t === "videos" ? "id" : "video_id"}=?`).run(vid);
      d.prepare(`DELETE FROM docs_fts WHERE video_id=?`).run(vid);
    }),
  };
}
