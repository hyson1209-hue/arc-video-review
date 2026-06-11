// upload.jsx — 실제 업로드 + SSE 실시간 병렬 처리 진행 상황
import { useEffect, useRef, useState } from "react";
import { STAGE_DEFS, STAGE_GROUPS } from "./data.js";
import { fetchVideos, subscribeEvents, uploadFiles } from "./api.js";
import { Icon, Thumb } from "./ui.jsx";

const newStages = () => Object.fromEntries(STAGE_DEFS.map(s => [s.key, { status: "wait", progress: 0, error: null }]));

function StageRow({ def, s }) {
  const fillClass = s.status === "done" ? "bar__fill--done" : s.status === "error" ? "bar__fill--err" : "";
  const statusEl =
    s.status === "done" ? <span style={{ color: "var(--pass)", display: "inline-flex" }}><Icon name="check" size={15} /></span>
    : s.status === "error" ? <span style={{ color: "var(--block)", display: "inline-flex" }}><Icon name="alert" size={14} /></span>
    : s.status === "run" ? <span className="mono num-strong" style={{ fontSize: 12 }}>{Math.round(s.progress)}%</span>
    : <span className="muted" style={{ fontSize: 11.5 }}>대기</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "126px 1fr 46px", alignItems: "center", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: s.status === "wait" ? "var(--text-3)" : "var(--text)" }}>{def.label}</div>
        {s.status === "error" && <div className="mono" style={{ fontSize: 10.5, color: "var(--block)", marginTop: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={s.error}>{s.error || "오류 — 건너뜀"}</div>}
      </div>
      <div className="bar"><div className={"bar__fill " + fillClass}
        style={{ width: (s.status === "error" ? Math.max(10, s.progress) : s.progress) + "%", opacity: s.status === "wait" ? 0 : 1 }} /></div>
      <div style={{ textAlign: "right" }}>{statusEl}</div>
    </div>
  );
}

function jobPct(stages) {
  const vals = STAGE_DEFS.map(d => stages[d.key]?.status === "error" ? 100 : stages[d.key]?.progress || 0);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function JobCard({ job, onOpen }) {
  const pct = jobPct(job.stages);
  const hasErr = STAGE_DEFS.some(d => job.stages[d.key]?.status === "error");
  return (
    <div className="card fade" style={{ marginBottom: "var(--gap)" }}>
      <div className="card__h">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Thumb t={null} style={{ width: 64, flex: "none" }} src={job.thumb} play />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.title}</h3>
            <div className="mono muted" style={{ fontSize: 11.5, marginTop: 2 }}>{job.file}{job.size ? ` · ${job.size}` : ""}</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {job.done
            ? <span className="badge badge--pass"><span className="dot" />처리 완료</span>
            : <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <span className="mono num-strong" style={{ fontSize: 17, color: "var(--primary)" }}>{pct}%</span>
                <span className="badge badge--neutral pulse">처리 중</span>
              </div>}
        </div>
      </div>
      <div className="card__b" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "calc(var(--gap) + 4px)" }}>
        {STAGE_GROUPS.map(g => (
          <div key={g}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{g}</div>
            <div style={{ display: "grid", gap: 11 }}>
              {STAGE_DEFS.filter(d => d.group === g).map(d =>
                <StageRow key={d.key} def={d} s={job.stages[d.key] || { status: "wait", progress: 0 }} />)}
            </div>
          </div>
        ))}
      </div>
      {job.done && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "12px var(--card-pad)", borderTop: "1px solid var(--border)", background: "var(--surface-2)",
          borderRadius: "0 0 var(--radius) var(--radius)" }}>
          <span style={{ fontSize: 12.5, color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 7 }}>
            <Icon name="bell" size={14} />텔레그램으로 결과 요약 전송됨
            {hasErr && <span className="badge badge--caution" style={{ marginLeft: 4 }}><span className="dot" />일부 단계 실패 · 나머지 완료</span>}
          </span>
          <button className="btn btn--sm btn--primary" onClick={() => onOpen({ view: "report", id: job.id })}>
            리포트 보기<Icon name="chevR" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function Upload({ onOpen }) {
  const [jobs, setJobs] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const dragRef = useRef(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);

  // 진입 시 처리 중/최근 영상 카드 복원
  useEffect(() => {
    let on = true;
    fetchVideos().then(vs => {
      if (!on) return;
      setJobs(vs.filter(v => v.status !== "error").slice(0, 8).map(v => ({
        id: v.id, title: v.title, file: v.file, size: v.size, thumb: v.thumb,
        done: v.status === "done",
        stages: { ...newStages(), ...Object.fromEntries((v.stages || []).map(s => [s.key, s])) },
      })));
    }).catch(() => {});
    return () => { on = false; };
  }, []);

  // SSE — 단계 진행률·완료
  useEffect(() => subscribeEvents(ev => {
    if (ev.type === "stage") {
      setJobs(prev => prev.map(j => j.id === ev.videoId
        ? { ...j, stages: { ...j.stages, [ev.key]: { status: ev.status, progress: ev.progress, error: ev.error } } }
        : j));
    } else if (ev.type === "video-done") {
      setJobs(prev => prev.map(j => j.id === ev.videoId ? { ...j, done: true } : j));
    }
  }), []);

  async function doUpload(files) {
    if (!files?.length || uploading) return;
    setUploading(true); setError(null);
    try {
      const list = [...files];
      const created = await uploadFiles(list);
      setJobs(prev => [
        ...created.map((c, i) => ({
          id: c.id, title: c.title, file: list[i]?.name || c.title, size: fmtSize(list[i]?.size),
          done: false, stages: newStages(),
        })),
        ...prev,
      ]);
    } catch (e) { setError(String(e.message || e)); }
    finally { setUploading(false); }
  }

  const active = jobs.filter(j => !j.done).length;

  return (
    <div className="view fade">
      <div className="pagehead">
        <div>
          <div className="eyebrow">업로드 & 처리</div>
          <h1>영상 업로드</h1>
          <p>영상을 올리면 자막·장면·기술 검토와 금칙 검수가 동시에 자동 실행됩니다.</p>
        </div>
        <button className="btn btn--ghost" onClick={() => onOpen({ view: "dashboard" })}>
          <Icon name="grid" size={15} />대시보드
        </button>
      </div>

      <input ref={fileRef} type="file" multiple accept="video/*,.mxf,.mov,.mp4,.mkv"
        style={{ display: "none" }} onChange={e => { doUpload(e.target.files); e.target.value = ""; }} />

      <div className="card" style={{ marginBottom: "var(--gap)" }}
        onDragOver={e => { e.preventDefault(); if (!dragRef.current) { dragRef.current = true; setDrag(true); } }}
        onDragLeave={() => { dragRef.current = false; setDrag(false); }}
        onDrop={e => { e.preventDefault(); dragRef.current = false; setDrag(false); doUpload(e.dataTransfer.files); }}>
        <div style={{ padding: "30px var(--card-pad)", border: "1.5px dashed " + (drag ? "var(--primary)" : "var(--border-2)"),
          borderRadius: "var(--radius)", margin: 10, background: drag ? "var(--primary-soft)" : "var(--surface-2)",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 18, transition: "all 0.15s", textAlign: "center", flexWrap: "wrap" }}>
          <div style={{ width: 46, height: 46, borderRadius: 12, background: "var(--surface)", border: "1px solid var(--border)",
            display: "grid", placeItems: "center", color: "var(--primary)" }}>
            <Icon name="upload" size={22} />
          </div>
          <div style={{ textAlign: "left" }}>
            <div style={{ fontWeight: 600, fontSize: 14.5 }}>영상 파일을 여기에 끌어다 놓으세요</div>
            <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>MXF · MOV · MP4 — 1개 이상 누적 업로드 가능</div>
            {error && <div style={{ fontSize: 12.5, color: "var(--block)", marginTop: 4 }}>업로드 실패: {error}</div>}
          </div>
          <button className="btn btn--primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={15} />{uploading ? "업로드 중…" : "파일 선택"}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 12px" }}>
        <span className="eyebrow">처리 현황</span>
        {active > 0 && <span className="badge badge--neutral pulse">{active}건 처리 중</span>}
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>영상 간 · 영상 내 단계 병렬 실행</span>
      </div>

      {jobs.length === 0 && (
        <div className="card" style={{ padding: "28px var(--card-pad)", textAlign: "center", color: "var(--text-3)" }}>
          처리 이력이 없습니다 — 첫 영상을 업로드해 보세요.
        </div>
      )}
      {jobs.map(j => <JobCard key={j.id} job={j} onOpen={onOpen} />)}
    </div>
  );
}

const fmtSize = (b) => b == null ? "" : b >= 1024 ** 3 ? (b / 1024 ** 3).toFixed(1) + " GB" : Math.round(b / 1024 ** 2) + " MB";
