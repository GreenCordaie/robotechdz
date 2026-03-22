@echo off
setlocal
title ROBOTECH - Demarrage Complet
color 0A
cd /d "%~dp0"

echo.
echo  ====================================================
echo    ROBOTECH ADMIN PLATFORM v5.0 - Demarrage 1-click
echo  ====================================================
echo.

REM ─── 1. Docker Desktop ───────────────────────────────────────────────────────
echo  [1/5] Verification de Docker...
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo  Docker non actif. Lancement de Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo  Attente du demarrage de Docker Desktop (45s max)...
    set /a tries=0
    :wait_docker
    timeout /t 3 /nobreak >nul
    docker info >nul 2>&1
    if %errorlevel% equ 0 goto docker_ok
    set /a tries+=1
    if %tries% lss 15 goto wait_docker
    echo  ERREUR: Docker Desktop n'a pas demarré. Ouvrez-le manuellement.
    goto :fin
)
:docker_ok
echo  Docker OK.

REM ─── 2. Containers Docker (DB, n8n, Redis, Mongo, Waha) ──────────────────────
echo.
echo  [2/5] Demarrage des containers Docker...
docker compose up -d
if %errorlevel% neq 0 (
    echo  ERREUR: docker compose up -d a echoue.
    goto :fin
)
echo  Containers lances. Attente initialisation (15s)...
timeout /t 15 /nobreak >nul

REM ─── 3. Liberer le port 1556 si occupe ───────────────────────────────────────
echo.
echo  [3/5] Liberation du port 1556...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":1556 "') do (
    echo  Liberation PID %%a...
    taskkill /F /PID %%a >nul 2>&1
)
echo  Port 1556 libre.

REM ─── 4. Dependances npm ───────────────────────────────────────────────────────
echo.
if not exist "node_modules" (
    echo  [4/5] Installation des dependances npm...
    call npm install --silent
    if %errorlevel% neq 0 (
        echo  ERREUR: npm install a echoue.
        goto :fin
    )
) else (
    echo  [4/5] Dependances npm OK.
)

REM ─── 5. Orchestrateur ────────────────────────────────────────────────────────
echo.
echo  [5/5] Lancement de l'orchestrateur Robotech...
echo.
echo  Ce qui se lance automatiquement :
echo    - Next.js sur le port 1556
echo    - Tunnel Cloudflare (App + n8n)
echo    - DB mise a jour avec la nouvelle URL publique
echo    - Waha (WhatsApp) : session demarree + webhook reconfigure
echo    - Telegram : webhook reconfigure
echo    - QR Code sauvegarde sur le Bureau si reconnexion WhatsApp necessaire
echo.
echo  Ctrl+C pour tout arreter.
echo.

node scripts/start-dev.js

:fin
echo.
echo  ====================================================
echo  Appuyez sur une touche pour fermer cette fenetre...
echo  ====================================================
pause >nul
