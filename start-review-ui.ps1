Set-Location C:\OpenMausBot-src
$env:OMB_AUTH_TOKEN = (Get-Content -Raw C:\OpenMausBot-src\.omb-lan-token).Trim()
$env:OMB_UI_HOST = '0.0.0.0'
$env:OMB_UI_PORT = '8802'
$env:OGB_PORT = '8800'
$env:OMB_HOST = '0.0.0.0'
$env:OMB_PORT = '8800'
$node = 'C:\Progra~1\nodejs\node.exe'
& $node node_modules\vite\bin\vite.js --host 0.0.0.0 --port 8802 *>> C:\OpenMausBot-review-data\vite-ui.log
