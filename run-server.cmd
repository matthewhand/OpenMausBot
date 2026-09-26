@echo off
cd /d C:\OpenMausBot-src
rem Primary instance: API 8799 + webhook receiver 8797.
rem Both ports are pinned. The webhook used to default to PORT+1 = 8800, which
rem is the review stack's API port (start-review-api.ps1) - whenever this ran
rem first, the review API died with "listen EADDRINUSE 0.0.0.0:8800". Pinning
rem OMB_PORT as well stops a leaked OMB_PORT=8800 (start-review-*.ps1 exports
rem it) from moving this instance onto the review API's port.
set OMB_PORT=8799
set OMB_WEBHOOK_PORT=8797
"C:\Progra~1\nodejs\node.exe" --experimental-strip-types server\index.ts > C:\OpenMausBot-src\server.log 2>&1
