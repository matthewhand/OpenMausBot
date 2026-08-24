Set-Location C:\OpenMausBot-src
$env:OMB_AUTH_TOKEN = (Get-Content -Raw C:\OpenMausBot-src\.omb-lan-token).Trim()
$env:OMB_HOST = '0.0.0.0'
$env:OMB_PORT = '8800'
$env:OMB_CORS_ORIGIN = '*'
$env:OMB_DATA_DIR = 'C:\OpenMausBot-review-data'
$env:OMB_TTS_PROVIDER = 'openai-compatible'
$env:OMB_TTS_BASE_URL = 'http://10.0.0.30:8000/v1'
$env:OMB_TTS_MODEL = 'kokoro'
$node = 'C:\Progra~1\nodejs\node.exe'
& $node --experimental-strip-types server\index.ts *>> C:\OpenMausBot-review-data\server.log
