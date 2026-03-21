@echo off
setlocal
title FLEXBOX - ONE CLICK LAUNCHER

echo ----------------------------------------------------
echo 🚀 FLEXBOX DIRECT : SYSTEME D'AUTOMATISATION
echo ----------------------------------------------------
echo.

:: 1. Vérification de Docker
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ ERREUR: Docker n'est pas installe ou n'est pas lance.
    pause
    exit /b
)

:: 2. Démarrage des Services Docker (Base de données, n8n, WhatsApp API)
echo 📦 [1/3] Demarrage des containers Docker (DB, n8n, WhatsApp)...
docker compose up -d
if %errorlevel% neq 0 (
    echo ❌ ERREUR: Echec du lancement de Docker Compose.
    pause
    exit /b
)

:: 3. Attente de la disponibilité
echo ⏳ Attente de l'initialisation des services (10s)...
timeout /t 10 /nobreak >nul

:: 4. Lancement de l'Orchestrateur Next.js + Dual-Tunnel
echo.
echo 🌐 [2/3] Lancement de l'App et des Tunnels Cloudflare...
echo ✅ App URL et n8n Webhook seront configures automatiquement.
echo ✅ Le Bot Telegram et le Webhook WhatsApp seront synchronises.
echo.

:: Lancer l'orchestrateur dans la fenêtre actuelle
npm run dev:tunnel

echo.
echo ----------------------------------------------------
echo 👋 Systeme arrete.
echo ----------------------------------------------------
pause
