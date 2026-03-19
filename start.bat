@echo off
echo 🚀 Lancement de FLEXBOX DIRECT (Server + WhatsApp)...

:: Lancer WhatsApp dans une nouvelle fenetre
start whatsapp.bat

:: Lancer le serveur dans la fenetre actuelle
npm run dev:tunnel
