@echo off
cd /d C:\OpenMausBot-src
rem Primary dev UI: Vite on 8802 proxying /api to OMB_PORT (vite.config.ts,
rem default 8799 = the primary API). start-review-ui.ps1 also uses 8802 for the
rem review UI and exports OMB_PORT=8800, so only one of the two should run in a
rem given shell; the 5199 alias belongs to the review stack and is started by
rem start-review-ui.ps1, not here.
C:\Progra~1\nodejs\node.exe node_modules\vite\bin\vite.js --host 0.0.0.0 --port 8802 > vite-out.log 2>&1
