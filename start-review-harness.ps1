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
}
