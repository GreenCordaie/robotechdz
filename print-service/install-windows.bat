@echo off
setlocal EnableDelayedExpansion
title ROBOTECH Print Service - Installation
color 0A
cd /d "%~dp0"

echo.
echo  =========================================================
echo    ROBOTECH PRINT SERVICE v2.0 — Installation 1-clic
echo  =========================================================
echo.

REM ── Verifier Node.js ─────────────────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERREUR: Node.js n'est pas installe !
    echo  Telechargez-le ici : https://nodejs.org/en/download
    echo.
    start https://nodejs.org/en/download
    goto :fin
)
echo  [1/5] Node.js detecte : OK

REM ── Installer express ─────────────────────────────────────────────────────────
echo  [2/5] Installation des dependances npm...
call npm install --silent 2>nul
if %errorlevel% neq 0 (
    echo  ERREUR: npm install a echoue.
    goto :fin
)
echo        OK

REM ── Installer pkg globalement ─────────────────────────────────────────────────
echo  [3/5] Installation de pkg (packager en .exe)...
call npm install -g pkg --silent 2>nul
echo        OK

REM ── Detecter et configurer l'imprimante ──────────────────────────────────────
echo  [4/5] Configuration de l'imprimante...
echo.
echo  Les imprimantes detectees dans Windows :
wmic printer get Name,PortName /format:list 2>nul | findstr /i "Name\|Port"
echo.

REM Chercher le port de l'imprimante Xprinter automatiquement
for /f "tokens=2 delims==" %%a in ('wmic printer where "name like '%%Xprinter%%' or name like '%%XP-80%%' or name like '%%thermal%%'" get PortName /value 2^>nul ^| findstr "PortName"') do (
    set "DETECTED_PORT=%%a"
)

if defined DETECTED_PORT (
    echo  Xprinter detecte sur le port : !DETECTED_PORT!
    REM Mettre a jour config.json avec le bon port
    node -e "const fs=require('fs');const c=JSON.parse(fs.readFileSync('config.json','utf8'));c.printerPort='!DETECTED_PORT!'.trim();fs.writeFileSync('config.json',JSON.stringify(c,null,2));" 2>nul
    echo  config.json mis a jour automatiquement.
) else (
    echo  Xprinter non detecte automatiquement.
    echo  Lance "node setup.js" pour configurer manuellement l'imprimante.
)

REM ── Build du .exe ─────────────────────────────────────────────────────────────
echo.
echo  [5/5] Generation du fichier .exe...
if not exist "dist" mkdir dist
call pkg server.js --targets node18-win-x64 --output dist\RobotechPrint.exe 2>nul
if exist "dist\RobotechPrint.exe" (
    echo  EXE genere : dist\RobotechPrint.exe
) else (
    echo  ATTENTION: EXE non genere ^(pkg non disponible^).
    echo  Le service fonctionnera via "node server.js".
)

REM ── Demarrage automatique Windows (registre HKCU) ────────────────────────────
set "EXE_PATH=%~dp0dist\RobotechPrint.exe"
set "NODE_PATH="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_PATH set "NODE_PATH=%%i"
set "SCRIPT_PATH=%~dp0server.js"

REM Utiliser l'exe si disponible, sinon node + script
if exist "!EXE_PATH!" (
    set "START_CMD=!EXE_PATH!"
    echo  Demarrage auto : EXE
) else (
    set "START_CMD="!NODE_PATH!" "!SCRIPT_PATH!""
    echo  Demarrage auto : node server.js
)

reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Run" ^
    /v "RobotechPrintService" ^
    /t REG_SZ ^
    /d "!START_CMD!" ^
    /f >nul 2>&1
echo  Demarrage automatique Windows configure.

REM ── Demarrer le service maintenant ───────────────────────────────────────────
echo.
echo  Demarrage du service...
if exist "!EXE_PATH!" (
    start "" "!EXE_PATH!"
) else (
    start "" "!NODE_PATH!" "!SCRIPT_PATH!"
)

timeout /t 2 /nobreak >nul
curl -s http://127.0.0.1:6543/health 2>nul | findstr "ok" >nul
if %errorlevel% equ 0 (
    echo  Service demarre et operationnel sur http://127.0.0.1:6543
) else (
    echo  Service en cours de demarrage...
    echo  Verifiez avec : curl http://127.0.0.1:6543/health
)

echo.
echo  =========================================================
echo    Installation terminee !
echo.
echo    PROCHAINE ETAPE si l'imprimante n'a pas ete detectee :
echo    Ouvre un terminal dans ce dossier et lance :
echo      node setup.js
echo.
echo    Fichiers importants :
echo      config.json    → Configuration port imprimante + secret
echo      print.log      → Journal des impressions
echo      dist\RobotechPrint.exe → Executable autonome
echo  =========================================================

:fin
echo.
pause
