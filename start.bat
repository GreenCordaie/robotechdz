@echo off
setlocal
title ROBOTECH - Demarrage Complet
color 0A
cd /d "%~dp0"

echo.
echo  ====================================================
echo    ROBOTECH ADMIN PLATFORM v6.0 - Demarrage 1-click
echo  ====================================================
echo.

REM --- 1. Verifier Docker ---
echo  [1/5] Verification de Docker...
docker info >/dev/null 2>&1
if errorlevel 1 goto docker_ko
echo  Docker OK.
goto docker_suite

:docker_ko
echo  Docker non actif. Lancez Docker Desktop manuellement puis relancez.
pause
exit /b 1

:docker_suite

REM --- 2. Containers Docker ---
echo.
echo  [2/5] Demarrage des containers Docker...
docker compose up -d
if errorlevel 1 (
    echo  ERREUR: docker compose up -d a echoue.
    pause
    exit /b 1
)
echo  Containers lances.

REM --- 3. Liberer le port 1556 ---
echo.
echo  [3/5] Liberation du port 1556...
for /f "tokens=5" %%a in ('netstat -ano 2^>/dev/null ^| findstr ":1556 "') do (
    taskkill /F /PID %%a >/dev/null 2>&1
)
echo  Port 1556 libre.

REM --- 4. Dependances npm ---
echo.
if not exist "node_modules" (
    echo  [4/5] Installation des dependances npm...
    call npm install --silent
) else (
    echo  [4/5] Dependances npm OK.
)

REM --- 5. Orchestrateur ---
echo.
echo  [5/5] Lancement orchestrateur v6.0...
echo.
echo  - Next.js port 1556
echo  - Tunnel Cloudflare (App + n8n)
echo  - Sync DB + Waha + Telegram
echo  - Notification Telegram avec nouveau lien
echo.
echo  Ctrl+C pour tout arreter.
echo.

node scripts/start-dev.js

echo.
echo  ====================================================
echo  Appuyez sur une touche pour fermer...
echo  ====================================================
pause >nul
