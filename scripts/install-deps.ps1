# 使用專案內建 npm 安裝依賴
$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
$Npm = Join-Path $Root ".tools\node\npm.cmd"

if (-not (Test-Path $Npm)) {
  Write-Error "找不到專案內建 npm：$Npm"
}

Set-Location $Root
$registry = if ($env:NPM_REGISTRY) { $env:NPM_REGISTRY } else { "https://registry.npmjs.org/" }
& $Npm ci --registry=$registry --no-audit --no-fund @args
