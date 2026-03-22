@echo off
:: Necessite droits Administrateur
net session >nul 2>&1
if errorlevel 1 (
    echo Relancement en Administrateur...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

echo Ouverture du port 1556 dans le pare-feu Windows...
netsh advfirewall firewall add rule name="Robotech-NextJS-1556" dir=in action=allow protocol=TCP localport=1556
echo.
echo Port 1556 ouvert - le PC caisse peut maintenant contacter ce serveur.
pause
