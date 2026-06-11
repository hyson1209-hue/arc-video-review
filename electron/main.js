// electron/main.js — ARC 데스크톱 셸
// Express 서버를 내장 Node(ELECTRON_RUN_AS_NODE)로 자식 실행하고 창이 localhost 를 로드한다.
import { app, BrowserWindow, dialog, shell } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3401; // 개발용(3001)과 충돌하지 않는 전용 포트
const packaged = app.isPackaged;
const appRoot = path.resolve(__dirname, "..");
const serverEntry = packaged
  ? path.join(process.resourcesPath, "server", "index.cjs")
  : path.join(appRoot, "server", "src", "index.js");
const webDist = packaged
  ? path.join(process.resourcesPath, "web")
  : path.join(appRoot, "archive-review", "dist");

const ENV_TEMPLATE = `# ARC 설정 — 값을 채운 뒤 앱을 다시 시작하세요
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
SAMPLE_INTERVAL_SEC=1
JUDGE_GROUP_SIZE=3
SCENE_INTERVAL_SEC=60
JUDGE_CONCURRENCY=4
`;

let serverProc = null;

function prepareUserData() {
  const ud = app.getPath("userData");
  const dataDir = path.join(ud, "data");
  const rulesDir = path.join(ud, "rules");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });

  // .env — 없으면 템플릿 생성 (개발 모드에선 프로젝트 루트 .env 가 있으면 그걸 사용)
  let envPath = path.join(ud, ".env");
  const devEnv = path.join(appRoot, ".env");
  if (!packaged && fs.existsSync(devEnv)) envPath = devEnv;
  const envCreated = !fs.existsSync(envPath);
  if (envCreated) fs.writeFileSync(envPath, ENV_TEMPLATE);

  // 금칙기준.md — 없으면 번들 기본본 복사 (사용자가 수정하면 다음 영상부터 적용)
  const rulesPath = path.join(rulesDir, "금칙기준.md");
  if (!fs.existsSync(rulesPath)) {
    const bundled = packaged
      ? path.join(process.resourcesPath, "server", "rules", "금칙기준.md")
      : path.join(appRoot, "server", "rules", "금칙기준.md");
    fs.copyFileSync(bundled, rulesPath);
  }
  return { dataDir, envPath, rulesPath, envCreated };
}

function startServer(paths) {
  serverProc = spawn(process.execPath, [serverEntry], {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      PORT: String(PORT),
      ARC_DATA_DIR: paths.dataDir,
      ARC_ENV_PATH: paths.envPath,
      ARC_RULES_PATH: paths.rulesPath,
      ARC_WEB_DIST: webDist,
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  serverProc.stdout.on("data", d => console.log(`[server] ${d}`.trim()));
  serverProc.stderr.on("data", d => console.error(`[server] ${d}`.trim()));
}

async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

async function createWindow() {
  const paths = prepareUserData();
  startServer(paths);

  const win = new BrowserWindow({
    width: 1440, height: 920, minWidth: 1080, minHeight: 640,
    title: "ARC — 아카이브 검수 콘솔",
    autoHideMenuBar: true,
    backgroundColor: "#f4f5f7",
  });
  // 외부 링크는 기본 브라우저로
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: "deny" }; });

  const up = await waitForServer();
  if (!up) {
    dialog.showErrorBox("ARC", "내장 서버를 시작하지 못했습니다. ffmpeg 설치 여부를 확인하세요.");
    app.quit();
    return;
  }
  await win.loadURL(`http://localhost:${PORT}`);

  if (paths.envCreated) {
    const { response } = await dialog.showMessageBox(win, {
      type: "info", title: "ARC 초기 설정",
      message: "OpenAI API 키가 설정되지 않았습니다.",
      detail: `${paths.envPath}\n\n위 파일에 OPENAI_API_KEY 를 채운 뒤 앱을 다시 시작하면 분석 기능이 활성화됩니다.`,
      buttons: ["설정 파일 열기", "나중에"],
    });
    if (response === 0) shell.openPath(paths.envPath);
  }
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => app.quit());
app.on("quit", () => { try { serverProc?.kill(); } catch {} });
