# Start API+UI for the review data dir if they are not already up.
# Used by the logon scheduled task so a reboot does not come up on the empty default store.
$ErrorActionPreference = 'Continue'
function Listening([int]$port) {
  return [bool](Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port })
}
# 8800 being busy does not mean the review API owns it - a primary's webhook
# receiver squats the port too (it 404s /api/health), and gating on Listening
# alone meant the API was never started again and the stack stayed down with
# nothing in the log. Ask the tenant instead: same bot signature as
# start-review-api.ps1 uses to prove 8800 is ours.
function ReviewApiHealthy {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/api/health' -TimeoutSec 2
    if ($health.app -ne 'openmausbot') { return $false }
    $payload = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/api/bots' -TimeoutSec 10
    $names = @($payload.bots | ForEach-Object { $_.name })
    return ($names.Count -ge 8 -and ($names -contains 'reachy') -and ($names -contains 'Chief of Staff'))
  } catch {
    return $false
  }
}
$api = Join-Path $PSScriptRoot 'start-review-api.ps1'
$ui = Join-Path $PSScriptRoot 'start-review-ui.ps1'
if (-not (ReviewApiHealthy)) {
  # start-review-api.ps1 decides what to do: start (8800 free), wait (already
  # ours), or refuse with a log line (another tenant holds 8800 - it never
  # kills what it cannot prove is ours).
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$api) -WindowStyle Hidden
}
if (-not (Listening 8802)) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ui) -WindowStyle Hidden
} elseif (-not (Listening 5199)) {
  # Vite is already up; still restore the historical LAN port.
  $node = 'C:\Progra~1\nodejs\node.exe'
  Start-Process -FilePath $node -ArgumentList @('scripts\review-ui-alias.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput 'C:\OpenMausBot-review-data\ui-alias-5199.out.log' -RedirectStandardError 'C:\OpenMausBot-review-data\ui-alias-5199.err.log'
}
