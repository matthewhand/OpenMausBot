Set-Location C:\OpenMausBot-src
$env:OMB_AUTH_TOKEN = (Get-Content -Raw C:\OpenMausBot-src\.omb-lan-token).Trim()
$env:OMB_UI_HOST = '0.0.0.0'
$env:OMB_UI_PORT = '8802'
$env:OGB_PORT = '8800'
$env:OMB_HOST = '0.0.0.0'
$env:OMB_PORT = '8800'
# HTTP on purpose — TLS terminates on nginx (10.0.0.36).
Remove-Item Env:OMB_UI_HTTPS -ErrorAction SilentlyContinue
Remove-Item Env:OMB_UI_TLS_KEY -ErrorAction SilentlyContinue
Remove-Item Env:OMB_UI_TLS_CERT -ErrorAction SilentlyContinue

$log = 'C:\OpenMausBot-review-data\vite-ui.log'
function Write-ReviewUiLog([string]$Message) {
    Add-Content -Path $log -Value ('{0} {1}' -f (Get-Date -Format o), $Message)
}

function Get-ListenPid([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
    return $null
}

$existing = Get-ListenPid 8802
if ($existing) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$existing" -ErrorAction SilentlyContinue
    $cmd = [string]$proc.CommandLine
    if ($cmd -match 'vite\.js' -and $cmd -match '8802') {
        Write-ReviewUiLog "correct review UI already on 8802 pid $existing; waiting instead of starting a second copy"
        Wait-Process -Id $existing -ErrorAction SilentlyContinue
    }
}

for ($i = 0; $i -lt 30; $i++) {
    try {
        Invoke-WebRequest -Uri 'http://127.0.0.1:8800/api/health' -UseBasicParsing -TimeoutSec 2 | Out-Null
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

$node = 'C:\Progra~1\nodejs\node.exe'
& $node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 8802 *>> $log
