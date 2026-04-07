# ArchTrack: install a Windows Scheduled Task so the tracker
# - launches at user logon
# - restarts automatically on failure (crash, sleep/wake disconnect, etc.)
#
# Usage (run from the desktop/ folder in an elevated PowerShell):
#   powershell -ExecutionPolicy Bypass -File install-autostart-windows.ps1
#   powershell -ExecutionPolicy Bypass -File install-autostart-windows.ps1 -Stealth
#
# Re-running is safe — it overwrites the existing task.
# Uninstall with: schtasks /Delete /TN "ArchTrack Tracker" /F

param([switch]$Stealth)

$ErrorActionPreference = 'Stop'

$desktopDir  = (Resolve-Path "$PSScriptRoot").Path
$repoRoot    = (Resolve-Path "$desktopDir\..").Path
$electronBin = Join-Path $repoRoot 'node_modules\.bin\electron.cmd'

if (-not (Test-Path $electronBin)) {
  Write-Error "electron not found at $electronBin. Run 'npm install' in the repo root first."
}

$taskName = 'ArchTrack Tracker'
$stealthVal = if ($Stealth) { '1' } else { '0' }

# wrap the launch in a cmd.exe call so we can set the env var inline
$cmd = "cmd.exe"
$cmdArgs = "/c set ARCHTRACK_STEALTH=$stealthVal && `"$electronBin`" `"$desktopDir`""

$action    = New-ScheduledTaskAction -Execute $cmd -Argument $cmdArgs -WorkingDirectory $desktopDir
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings  = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartOnFailure `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName `
    -Action $action -Trigger $trigger -Settings $settings -Principal $principal `
    -Force | Out-Null

Start-ScheduledTask -TaskName $taskName

Write-Host "Installed Scheduled Task '$taskName'. Stealth mode: $(if ($Stealth) {'ON'} else {'OFF'})"
Write-Host "Tracker will auto-start at logon and auto-restart on failure."
