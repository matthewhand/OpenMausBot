# Review API: 8800 (API) + 8801 (webhook), data dir C:\OpenMausBot-review-data.
# Port map on this machine: primary (run-server.cmd / run-omb.cmd) 8799 + webhook
# 8797, review API 8800 + webhook 8801, review UI 8802 (alias 5199). Both webhook
# ports are pinned so no instance can derive PORT+1 onto 8800 - that is what took
# this stack down with "listen EADDRINUSE 0.0.0.0:8800".
Set-Location C:\OpenMausBot-src
$env:OMB_AUTH_TOKEN = (Get-Content -Raw C:\OpenMausBot-src\.omb-lan-token).Trim()
$env:OMB_HOST = '0.0.0.0'
$env:OMB_PORT = '8800'
$env:OMB_WEBHOOK_PORT = '8801'
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

# Who really owns $Port, enough to tell the review API from any other tenant.
# 'review' is only returned when /api/bots answers with this data dir's
# signature - a different bot list, an API whose bots we cannot read, a webhook
# receiver on the port and anything else come back as something else. Nothing
# here ever stops a process: an occupant we cannot prove is ours is refused
# with a log line instead, because killing "any server\index.ts" once killed
# the legit primary and emptied this stack out of the port map.
function Get-PortTenant([int]$Port) {
    $listenPid = Get-ListenPid $Port
    if (-not $listenPid) {
        return [pscustomobject]@{ Pid = $null; Kind = 'empty'; Detail = 'nothing is listening' }
    }
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$listenPid" -ErrorAction SilentlyContinue
    $cmd = [string]$owner.CommandLine
    $health = $null
    $status = 0
    $answered = $false
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 3
        $answered = $true
    } catch {
        try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
    }
    if ($health -and [string]$health.app -eq 'openmausbot') {
        if ($health.pid -and [int]$health.pid -ne [int]$listenPid) {
            return [pscustomobject]@{ Pid = $listenPid; Kind = 'unknown'; Detail = "/api/health reports pid $($health.pid) but pid $listenPid owns $Port" }
        }
        try {
            $payload = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/bots" -TimeoutSec 15
            $names = @($payload.bots | ForEach-Object { $_.name })
            if ($names.Count -ge 8 -and ($names -contains 'reachy') -and ($names -contains 'Chief of Staff')) {
                return [pscustomobject]@{ Pid = $listenPid; Kind = 'review'; Detail = "review API pid $listenPid, $($names.Count) bots" }
            }
            return [pscustomobject]@{ Pid = $listenPid; Kind = 'other-omb'; Detail = "another OpenMausBot API: pid $listenPid owns $Port but serves $($names.Count) bots, not the review data dir" }
        } catch {
            return [pscustomobject]@{ Pid = $listenPid; Kind = 'other-omb'; Detail = "an OpenMausBot API we cannot prove is the review API: pid $listenPid owns $Port, /api/bots refused ($($_.Exception.Message))" }
        }
    }
    # Not an API answer. A primary's webhook receiver answers /health with
    # openmausbot-webhooks and 404s everything under /api - the squatter that
    # used to take this stack down.
    try {
        $hook = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/health" -TimeoutSec 3
        if ([string]$hook.app -eq 'openmausbot-webhooks') {
            return [pscustomobject]@{ Pid = $listenPid; Kind = 'webhook'; Detail = "a webhook receiver squats $Port (pid $listenPid, $cmd); that instance's OMB_WEBHOOK_PORT still points here" }
        }
    } catch { }
    $note = if ($status) { "HTTP $status" } elseif ($answered) { 'answered /api/health with an unrecognised body' } else { 'no HTTP answer' }
    $who = if ($cmd) { $cmd } else { "pid $listenPid" }
    return [pscustomobject]@{ Pid = $listenPid; Kind = 'unknown'; Detail = "$who owns $Port ($note)" }
}

$existing = Get-ListenPid 8800
if ($existing) {
    $tenant = Get-PortTenant 8800
    if ($tenant.Kind -eq 'review') {
        Write-ReviewLog "correct review API already on 8800 pid $existing; waiting instead of starting a second copy"
        Wait-Process -Id $existing -ErrorAction SilentlyContinue
    } else {
        # Refuse instead of killing. The old Stop-WrongOmbApi stopped any
        # server\index.ts holding 8800, which included the legit primary; a
        # stray instance doing the reverse is what caused today's outage.
        Write-ReviewLog "REFUSING to start: 8800 is not the review API ($($tenant.Detail)). Nothing was stopped - stop that process yourself, then re-run start-review-api.ps1"
        throw "start-review-api.ps1: 8800 is not the review API ($($tenant.Detail)); see $log"
    }
}

$hookOwner = Get-ListenPid 8801
if ($hookOwner) {
    Write-ReviewLog "warning: 8801 (this stack's webhook port) is held by pid $hookOwner; the review API will log 'webhook receiver unavailable'"
}
Write-ReviewLog "starting review API on 8800, webhook 8801, data dir C:\OpenMausBot-review-data"
$node = 'C:\Progra~1\nodejs\node.exe'
& $node --experimental-strip-types server\index.ts *>> $log
