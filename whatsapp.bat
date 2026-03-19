@echo off
echo 🟢 Demarrage du service WhatsApp (Evolution API v1.8.2)...

:: Lancement via Compose
docker compose up -d whatsapp

echo.
echo ✅ Service WhatsApp operationnel.
echo 👉 Allez dans Parametres > API & Bot.
echo 👉 Verifiez le nom de l'instance : FLEXBOX_APP
echo 👉 Cliquez sur ENREGISTRER puis sur Rafraichir.
