Set-Location C:\OpenMausBot-src
$env:OMB_AUTH_TOKEN = (Get-Content -Raw C:\OpenMausBot-src\.omb-lan-token).Trim()
$env:OMB_HOST = '0.0.0.0'
$env:OMB_PORT = '8800'
# Dev-mode LAN bypass: private RFC1918 + loopback skip the bearer token
# (Vite's /api proxy appears as 127.0.0.1; LAN clients keep working too).
$env:OMB_LAN_BYPASS_CIDR = 'true'
$env:OMB_CORS_ORIGIN = '*'
$env:OMB_DATA_DIR = 'C:\OpenMausBot-review-data'
$env:OMB_TTS_PROVIDER = 'openai-compatible'
$env:OMB_TTS_BASE_URL = 'http://10.0.0.30:8000/v1'
$env:OMB_TTS_MODEL = 'kokoro'

$log = 'C:\OpenMausBot-review-data\server.log'
function Write-ReviewLog([string]$Message) {
    Add-Content -Path $log -Value ('{0} {1}' -f (Get-Date -Format o), $Message)
}

function Get-ListenPid([int]$Port) {
    $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if ($conn) { return [int]$conn.OwningProcess }
    return $null
}

function Test-ReviewApiHealthy {
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/api/health' -TimeoutSec 3
        if ($health.app -ne 'openmausbot') { return $false }
        $payload = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/api/bots' -TimeoutSec 15
        $names = @($payload.bots | ForEach-Object { $_.name })
        return ($names.Count -ge 8 -and ($names -contains 'reachy') -and ($names -contains 'Chief of Staff'))
    } catch {
        return $false
    }
}

function Stop-WrongOmbApi {
    $listenPid = Get-ListenPid 8800
    if (-not $listenPid) { return }
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$listenPid" -ErrorAction SilentlyContinue
    if (-not $proc) { return }
    $cmd = [string]$proc.CommandLine
    if ($cmd -notmatch 'server\\index\.ts' -and $cmd -notmatch 'server/index\.ts') {
        Write-ReviewLog "8800 busy by non-OMB pid $listenPid; not killing"
        return
    }
    Write-ReviewLog "stopping wrong OpenMausBot on 8800 pid $listenPid"
    Stop-Process -Id $listenPid -Force -ErrorAction SilentlyContinue
    $parentPid = $proc.ParentProcessId
    if ($parentPid) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$parentPid" -ErrorAction SilentlyContinue
        $parentCmd = [string]$parent.CommandLine
        if ($parent -and ($parentCmd -match 'omb-start-server|start-review-api')) {
            Stop-Process -Id $parentPid -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Seconds 2
}

$existing = Get-ListenPid 8800
if ($existing) {
    if (Test-ReviewApiHealthy) {
        Write-ReviewLog "correct review API already on 8800 pid $existing; waiting instead of starting a second copy"
        Wait-Process -Id $existing -ErrorAction SilentlyContinue
    } else {
        Stop-WrongOmbApi
    }
}

$node = 'C:\Progra~1\nodejs\node.exe'
& $node --experimental-strip-types server\index.ts *>> $log
