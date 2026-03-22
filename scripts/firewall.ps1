New-NetFirewallRule -DisplayName "Robotech-NextJS-1556" -Direction Inbound -Protocol TCP -LocalPort 1556 -Action Allow
Write-Host "OK - Port 1556 ouvert"
