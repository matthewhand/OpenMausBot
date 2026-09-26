@echo off
cd /d C:\OpenMausBot-src
rem Primary-instance ports (see run-server.cmd): API 8799 + webhook 8797.
rem OMB_WEBHOOK_PORT must be explicit - the default PORT+1 lands on 8800, the
rem review stack's API port (start-review-api.ps1), and squatting it takes that
rem stack down with "listen EADDRINUSE 0.0.0.0:8800".
set OMB_PORT=8799
set OMB_WEBHOOK_PORT=8797
set OMB_DATA_DIR=C:\OpenMausBot-review-data
set OPENAI_COMPAT_API_KEY=sk-DEADBEEFCAFE
set OPENAI_COMPAT_URL=http://10.0.0.30:8000/v1
C:\Progra~1\nodejs\node.exe --experimental-strip-types server\index.ts > server-out.log 2> server-err.log
