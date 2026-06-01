# 使用專案內建 Node 直接啟動 Vite（不依賴系統 PATH 的 npm/pnpm）
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Node = Join-Path $Root ".tools\node\node.exe"
$Vite = Join-Path $Root "node_modules\vite\bin\vite.js"

if (-not (Test-Path $Node)) {
  Write-Error "找不到專案內建 Node：$Node"
}
if (-not (Test-Path $Vite)) {
  Write-Error "找不到 Vite，請先執行：scripts\install-deps.ps1"
}

Set-Location $Root
& $Node $Vite --host @args
