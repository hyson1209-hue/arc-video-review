@echo off
rem ARC 웹 버전 실행 — 서버 하나로 UI + API 모두 서빙 (포트 3001)
chcp 65001 >nul
cd /d "%~dp0"

rem 서버가 이미 떠 있으면 새로 띄우지 않고 브라우저만 연다
powershell -NoProfile -Command "try{(Invoke-WebRequest -UseBasicParsing http://localhost:3001/api/health -TimeoutSec 2)|Out-Null;exit 0}catch{exit 1}" >nul 2>&1
if %errorlevel%==0 goto open

where npm >nul 2>&1
if errorlevel 1 (
    echo [ARC] npm 을 찾을 수 없습니다. Node.js 설치 후 다시 실행하세요.
    pause
    exit /b 1
)

rem 서버 시작 — 오류로 죽으면 창을 닫지 않고 메시지를 보여준다
start "ARC Server" /min cmd /c "npm start --prefix server || (echo. & echo [ARC] 서버 시작 실패 — 위 오류를 확인하세요. & pause)"
timeout /t 3 /nobreak >nul

:open
start "" http://localhost:3001
