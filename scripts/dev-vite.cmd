@echo off
setlocal
cd /d "%~dp0.."
if not exist ".tools\node\node.exe" (
  echo 找不到專案內建 Node：.tools\node\node.exe
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo 找不到 Vite，請先執行：scripts\install-deps.cmd
  exit /b 1
)
".tools\node\node.exe" "node_modules\vite\bin\vite.js" --host %*
