New-NetFirewallRule -DisplayName "Robotech1556" -Direction Inbound -Protocol TCP -LocalPort 1556 -Action Allow -ErrorAction SilentlyContinue
Write-Host "Regle pare-feu 1556 OK"
