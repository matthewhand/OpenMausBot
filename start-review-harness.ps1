# Start API+UI for the review data dir if they are not already listening.
# Used by the logon scheduled task so a reboot does not come up on the empty default store.
$ErrorActionPreference = 'Continue'
function Listening([int]$port) {
  return [bool](Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq $port })
}
$api = Join-Path $PSScriptRoot 'start-review-api.ps1'
$ui = Join-Path $PSScriptRoot 'start-review-ui.ps1'
if (-not (Listening 8800)) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$api) -WindowStyle Hidden
}
if (-not (Listening 8802)) {
  Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File',$ui) -WindowStyle Hidden
} elseif (-not (Listening 5199)) {
  # Vite is already up; still restore the historical LAN port.
  $node = 'C:\Progra~1\nodejs\node.exe'
  Start-Process -FilePath $node -ArgumentList @('scripts\review-ui-alias.mjs') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput 'C:\OpenMausBot-review-data\ui-alias-5199.out.log' -RedirectStandardError 'C:\OpenMausBot-review-data\ui-alias-5199.err.log'
}
