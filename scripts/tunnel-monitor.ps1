# Robotech Tunnel & Automation Synchronizer v2
# This script monitors Cloudflare tunnel logs and automatically syncs all systems.

$root = "C:\Users\PC\Desktop\100-pc-IA"
$logFile = "$root\current_tunnel.log"
$envFile = "$root\.env"
$tempLog = "$root\scripts\tunnel_temp.txt"

function Get-LatestTunnelUrl {
    if (Test-Path $logFile) {
        Get-Content $logFile | Set-Content $tempLog -Encoding utf8
        $content = Get-Content $tempLog
        $match = $content | Select-String -Pattern 'https://[a-zA-Z0-9-]+\.trycloudflare\.com'
        if ($match) {
            return $match.Matches[$match.Matches.Count - 1].Value
        }
    }
    return $null
}

function Update-AppConfig($newUrl) {
    # 1. Update .env
    $lines = Get-Content $envFile
    $newLines = @()
    $changed = $false
    foreach ($line in $lines) {
        if ($line -match "^NEXT_PUBLIC_APP_URL=") {
            if ($line -ne "NEXT_PUBLIC_APP_URL=`"$newUrl`"") { $changed = $true }
            $newLines += "NEXT_PUBLIC_APP_URL=`"$newUrl`""
        }
        else { $newLines += $line }
    }
    $newLines | Set-Content $envFile

    # 2. Update Database (shop_settings)
    if ($changed) {
        Write-Host "[SYNC] Updating Database settings..."
        node "$root\scripts\sync_tunnel_db.js" "$newUrl"
    }
}

Write-Host ">>> Robotech Tunnel Synchronizer Active <<<"
$lastUrl = ""
while ($true) {
    try {
        $url = Get-LatestTunnelUrl
        if ($url -and ($url -ne $lastUrl)) {
            Write-Host "[DETECTED] New Tunnel Domain: $url"
            Update-AppConfig $url
            $lastUrl = $url
            Write-Host "[OK] System synchronized to new domain."
        }
    }
    catch {
        Write-Error "Sync Error: $_"
    }
    Start-Sleep -Seconds 30
}
