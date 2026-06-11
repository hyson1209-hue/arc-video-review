// upload.jsx — 업로드 + 실시간 병렬 처리 진행 상황
import { useEffect, useRef, useState } from "react";
import { Icon, Thumb } from "./ui.jsx";

// 처리 단계 정의 (병렬 / 의존 관계)
//  언어: 자막 추출 → 교정 (순차)
//  분석: 장면 분석 ∥ 기술 검토 (병렬) → 색인 생성
//  검수: 프레임 샘플링 → (50%부터) 프레임 금칙 판정 → 종합 판정
const STAGES_DEF = [
  { key: "extract", label: "자막 추출",        group: "언어", deps: [], rate: 3.4 },
  { key: "correct", label: "자막 교정",        group: "언어", deps: ["extract"], rate: 2.7 },
  { key: "scene",   label: "장면 분석",        group: "분석", deps: [], rate: 1.9 },
  { key: "tech",    label: "기술 검토",        group: "분석", deps: [], rate: 3.1 },
  { key: "index",   label: "색인 생성",        group: "분석", deps: ["correct", "scene", "tech"], rate: 4.2 },
  { key: "sample",  label: "프레임 샘플링",    group: "검수", deps: [], rate: 2.4 },
  { key: "judge",   label: "프레임 금칙 판정", group: "검수", deps: ["sample"], soft: { sample: 52 }, rate: 1.5 },
  { key: "verdict", label: "종합 판정",        group: "검수", deps: ["judge"], rate: 6 },
];
const GROUPS = ["언어", "분석", "검수"];
const SAMPLE_FILES = [
  { file: "drama_ep13_master.mxf", title: "도시의 밤 — 13회", size: "8.1 GB" },
  { file: "variety_special.mp4",   title: "특집 예능 — 단편",  size: "4.4 GB" },
  { file: "doc_river_part2.mxf",   title: "한강의 사계 — 2부", size: "9.0 GB" },
];

let JOB_SEQ = 100;
function makeJob(src, opts = {}) {
  return {
    uid: ++JOB_SEQ,
    file: src.file, title: src.title, size: src.size,
    startedAt: Date.now(),
    notified: false,
    failScene: !!opts.failScene,
    stages: STAGES_DEF.map(s => ({
      ...s,
      progress: 0,
      status: "wait",
      phase: s.key === "extract" ? "자막 트랙 탐색" : null,
    })),
  };
}

function advanceJob(job) {
  const map = Object.fromEntries(job.stages.map(s => [s.key, s]));
  let allDone = true;
  for (const s of job.stages) {
    if (s.status === "done" || s.status === "error") continue;
    allDone = false;
    const ready = s.deps.every(d => {
      const dep = map[d];
      if (dep.status === "error") return true;            // 실패해도 다음 단계 진행
      const need = (s.soft && s.soft[d]) || 100;
      return dep.progress >= need;
    });
    if (!ready) continue;
    if (s.status === "wait") s.status = "run";
    // 장면 분석 실패 데모
    if (job.failScene && s.key === "scene" && s.progress >= 38) {
      s.status = "error"; s.phase = "프레임 디코드 오류 — 건너뜀"; continue;
    }
    s.progress = Math.min(100, s.progress + s.rate * (0.7 + Math.random() * 0.6));
    if (s.key === "extract") s.phase = s.progress < 45 ? "음성 인식 받아쓰기" : "자막 정렬";
    if (s.key === "sample") s.phase = "약 1초 간격 추출";
    if (s.key === "judge") s.phase = "연속 2~3장 묶음 판정";
    if (s.progress >= 100) { s.progress = 100; s.status = "done"; s.phase = null; }
  }
  if (allDone && !job.done) job.done = true;
  return job;
}

function jobPct(job) {
  const eff = job.stages.map(s => s.status === "error" ? 100 : s.progress);
  return Math.round(eff.reduce((a, b) => a + b, 0) / eff.length);
}

function StageRow({ s }) {
  const fillClass = s.status === "done" ? "bar__fill--done" : s.status === "error" ? "bar__fill--err" : "";
  const statusEl =
    s.status === "done" ? <span style={{ color: "var(--pass)", display: "inline-flex" }}><Icon name="check" size={15} /></span>
    : s.status === "error" ? <span style={{ color: "var(--block)", display: "inline-flex" }}><Icon name="alert" size={14} /></span>
    : s.status === "run" ? <span className="mono num-strong" style={{ fontSize: 12 }}>{Math.round(s.progress)}%</span>
    : <span className="muted" style={{ fontSize: 11.5 }}>대기</span>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "126px 1fr 46px", alignItems: "center", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: s.status === "wait" ? "var(--text-3)" : "var(--text)" }}>{s.label}</div>
        {s.phase && <div className="mono" style={{ fontSize: 10.5, color: s.status === "error" ? "var(--block)" : "var(--text-3)", marginTop: 1 }}>{s.phase}</div>}
      </div>
      <div className="bar"><div className={"bar__fill " + fillClass}
        style={{ width: (s.status === "error" ? 38 : s.progress) + "%", opacity: s.status === "wait" ? 0 : 1 }} /></div>
      <div style={{ textAlign: "right" }}>{statusEl}</div>
    </div>
  );
}

function JobCard({ job, onOpen }) {
  const pct = jobPct(job);
  const hasErr = job.stages.some(s => s.status === "error");
  return (
    <div className="card fade" style={{ marginBottom: "var(--gap)" }}>
      <div className="card__h">
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <Thumb t={null} style={{ width: 64, flex: "none" }} play />
          <div style={{ minWidth: 0 }}>
            <h3 style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.title}</h3>
            <div className="mono muted" style={{ fontSize: 11.5, marginTop: 2 }}>{job.file} · {job.size}</div>
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
        {GROUPS.map(g => (
          <div key={g}>
            <div className="eyebrow" style={{ marginBottom: 10 }}>{g}</div>
            <div style={{ display: "grid", gap: 11 }}>
              {job.stages.filter(s => s.group === g).map(s => <StageRow key={s.key} s={s} />)}
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
          <button className="btn btn--sm btn--primary" onClick={() => onOpen({ view: "report", id: "v-2041" })}>
            리포트 보기<Icon name="chevR" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function Upload({ onOpen, pushToast }) {
  const [jobs, setJobs] = useState(() => {
    const seed = makeJob(SAMPLE_FILES[0], { failScene: true });
    // 진행 중 상태로 시작
    seed.stages.find(s => s.key === "extract").progress = 100;
    seed.stages.find(s => s.key === "extract").status = "done";
    seed.stages.find(s => s.key === "correct").progress = 64;
    seed.stages.find(s => s.key === "correct").status = "run";
    seed.stages.find(s => s.key === "tech").progress = 100;
    seed.stages.find(s => s.key === "tech").status = "done";
    seed.stages.find(s => s.key === "scene").progress = 38;
    seed.stages.find(s => s.key === "scene").status = "error";
    seed.stages.find(s => s.key === "scene").phase = "프레임 디코드 오류 — 건너뜀";
    seed.stages.find(s => s.key === "sample").progress = 47;
    seed.stages.find(s => s.key === "sample").status = "run";
    return [seed];
  });
  const [idx, setIdx] = useState(1);
  const dragRef = useRef(false);
  const [drag, setDrag] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      setJobs(prev => {
        let changed = false;
        const next = prev.map(j => {
          if (j.done) return j;
          const nj = advanceJob({ ...j, stages: j.stages.map(s => ({ ...s })) });
          changed = true;
          if (nj.done && !nj.notified) {
            nj.notified = true;
            const err = nj.stages.some(s => s.status === "error");
            setTimeout(() => pushToast({ title: nj.title, err }), 0);
          }
          return nj;
        });
        return changed ? next : prev;
      });
    }, 160);
    return () => clearInterval(id);
  }, []);

  function addJob() {
    const src = SAMPLE_FILES[idx % SAMPLE_FILES.length];
    setIdx(i => i + 1);
    setJobs(prev => [makeJob(src), ...prev]);
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

      <div className="card" style={{ marginBottom: "var(--gap)" }}
        onDragOver={e => { e.preventDefault(); if (!dragRef.current) { dragRef.current = true; setDrag(true); } }}
        onDragLeave={() => { dragRef.current = false; setDrag(false); }}
        onDrop={e => { e.preventDefault(); dragRef.current = false; setDrag(false); addJob(); }}>
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
          </div>
          <button className="btn btn--primary" onClick={addJob}><Icon name="upload" size={15} />파일 선택</button>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "0 2px 12px" }}>
        <span className="eyebrow">처리 현황</span>
        {active > 0 && <span className="badge badge--neutral pulse">{active}건 처리 중</span>}
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>영상 간 · 영상 내 단계 병렬 실행</span>
      </div>

      {jobs.map(j => <JobCard key={j.uid} job={j} onOpen={onOpen} />)}
    </div>
  );
}
