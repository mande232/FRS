@echo off
setlocal
cd /d "%~dp0"

echo EthioPlate cashier print agent
echo Folder: %cd%
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is not in PATH. Close this window, reopen Command Prompt, or reinstall Node and tick "Add to PATH".
  echo Then run this file again.
  pause
  exit /b 1
)

echo Node:
node -v
echo.

if not exist "scripts\pos-print-agent.mjs" (
  echo Missing scripts\pos-print-agent.mjs
  echo Copy the whole ethioPlate_pro folder to this laptop, not only Node.js.
  pause
  exit /b 1
)

if not exist ".env.local" (
  echo Missing .env.local
  echo Copy .env.local from the main PC into this same folder.
  pause
  exit /b 1
)

if not exist "node_modules\@supabase\supabase-js" (
  echo Installing packages ^(first time only^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting print agent. Leave this window open.
echo.
call npm run print-agent
echo.
echo Print agent stopped.
pause
