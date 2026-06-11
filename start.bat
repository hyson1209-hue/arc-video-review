@echo off
rem ARC 웹 버전 실행 — 서버 하나로 UI + API 모두 서빙 (포트 3001)
cd /d "%~dp0"
start "ARC Server" /min cmd /c "npm start --prefix server"
timeout /t 3 /nobreak >nul
start http://localhost:3001
