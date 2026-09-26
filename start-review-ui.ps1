# Review UI: Vite on 8802 (bookmarked LAN port) with the 5199 TCP alias on top,
# proxying /api to the review API on 8800. Port map: primary 8799 + webhook
# 8797 (run-server.cmd), review API 8800 + webhook 8801 (start-review-api.ps1),
# review UI 8802, alias 5199.
Set-Location C:\OpenMausBot-src
$env:OMB_AUTH_TOKEN = (Get-Content -Raw C:\OpenMausBot-src\.omb-lan-token).Trim()
$env:OMB_UI_HOST = '0.0.0.0'
$env:OMB_UI_PORT = '8802'
$env:OGB_PORT = '8800'
$env:OMB_HOST = '0.0.0.0'
# OMB_PORT only reaches vite.config.ts here - it is where /api is proxied to,
# so it must stay the review API's port and never drift with an ambient value.
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

# Is 8800 the review API, or just some other tenant? The old check only asked
# for a 2xx on /api/health: a webhook receiver there 404s (so it silently timed
# out) and another OpenMausBot API answers 2xx (so it was treated as healthy and
# Vite proxied /api into the wrong tenant). 'review' is only returned for this
# data dir's bot signature.
function Get-ReviewApiProbe {
    $listenPid = Get-ListenPid 8800
    if (-not $listenPid) {
        return [pscustomobject]@{ Kind = 'down'; Detail = 'nothing is listening on 8800' }
    }
    $health = $null
    $status = 0
    $answered = $false
    try {
        $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/api/health' -TimeoutSec 2
        $answered = $true
    } catch {
        try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
    }
    if (-not $health) {
        try {
            $hook = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/health' -TimeoutSec 2
            if ([string]$hook.app -eq 'openmausbot-webhooks') {
                return [pscustomobject]@{ Kind = 'webhook'; Detail = "a webhook receiver squats 8800 (pid $listenPid) - a primary instance's OMB_WEBHOOK_PORT still points here" }
            }
        } catch { }
        $note = if ($status) { "HTTP $status" } elseif ($answered) { 'an unrecognised /api/health body' } else { 'no HTTP answer' }
        return [pscustomobject]@{ Kind = 'down'; Detail = "pid $listenPid owns 8800 but it is not the review API ($note)" }
    }
    if ([string]$health.app -ne 'openmausbot') {
        return [pscustomobject]@{ Kind = 'down'; Detail = "pid $listenPid owns 8800 but /api/health is not an OpenMausBot answer" }
    }
    try {
        $payload = Invoke-RestMethod -Uri 'http://127.0.0.1:8800/api/bots' -TimeoutSec 10
        $names = @($payload.bots | ForEach-Object { $_.name })
        if ($names.Count -ge 8 -and ($names -contains 'reachy') -and ($names -contains 'Chief of Staff')) {
            return [pscustomobject]@{ Kind = 'review'; Detail = "review API pid $listenPid" }
        }
        return [pscustomobject]@{ Kind = 'other-omb'; Detail = "another OpenMausBot API on 8800 (pid $listenPid, $($names.Count) bots, not the review data dir)" }
    } catch {
        return [pscustomobject]@{ Kind = 'other-omb'; Detail = "an OpenMausBot API on 8800 we cannot prove is the review API (pid $listenPid): $($_.Exception.Message)" }
    }
}

function Start-ReviewUiAlias {
    $aliasPort = 5199
    $existingAlias = Get-ListenPid $aliasPort
    if ($existingAlias) {
        $aliasProc = Get-CimInstance Win32_Process -Filter "ProcessId=$existingAlias" -ErrorAction SilentlyContinue
        $aliasCmd = [string]$aliasProc.CommandLine
        if ($aliasCmd -match 'review-ui-alias') {
            Write-ReviewUiLog "UI alias already on $aliasPort pid $existingAlias"
            return
        }
        Write-ReviewUiLog "port $aliasPort busy by pid $existingAlias; not starting alias"
        return
    }
    $aliasOut = 'C:\OpenMausBot-review-data\ui-alias-5199.out.log'
    $aliasErr = 'C:\OpenMausBot-review-data\ui-alias-5199.err.log'
    Start-Process -FilePath $node -ArgumentList @('scripts\review-ui-alias.mjs') -WorkingDirectory 'C:\OpenMausBot-src' -WindowStyle Hidden -RedirectStandardOutput $aliasOut -RedirectStandardError $aliasErr
    Write-ReviewUiLog "started UI alias 5199 -> 8802"
}

$node = 'C:\Progra~1\nodejs\node.exe'

$existing = Get-ListenPid 8802
if ($existing) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$existing" -ErrorAction SilentlyContinue
    $cmd = [string]$proc.CommandLine
    if ($cmd -match 'vite\.js' -and $cmd -match '8802') {
        Write-ReviewUiLog "correct review UI already on 8802 pid $existing; waiting instead of starting a second copy"
        Start-ReviewUiAlias
        Wait-Process -Id $existing -ErrorAction SilentlyContinue
    }
}

$ready = $false
$lastNote = ''
$deadline = (Get-Date).AddSeconds(60)
while ((Get-Date) -lt $deadline) {
    $probe = Get-ReviewApiProbe
    if ($probe.Kind -eq 'review') {
        $ready = $true
        Write-ReviewUiLog "review API healthy on 8800 ($($probe.Detail))"
        break
    }
    if ($probe.Detail -ne $lastNote) {
        Write-ReviewUiLog "waiting for the review API on 8800: $($probe.Detail)"
        $lastNote = $probe.Detail
    }
    Start-Sleep -Seconds 2
}
if (-not $ready) {
    # Report it rather than time out quietly: starting Vite is still the
    # least-bad option (the UI itself is fine), but /api will fail or reach
    # whoever owns 8800 until start-review-api.ps1 has the port back.
    Write-ReviewUiLog "review API not healthy on 8800 within 60s ($lastNote); starting Vite anyway - /api calls will fail or hit the wrong tenant"
}

Start-ReviewUiAlias
& $node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 8802 *>> $log
