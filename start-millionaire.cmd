@echo off
setlocal
cd /d "%~dp0"
title Who Wants to Be a Millionaire app

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install the LTS version from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Building the app...
call npm run build
if errorlevel 1 (
  echo Build failed.
  pause
  exit /b 1
)

echo.
echo Starting the app at http://localhost:5174  ^(close this window to stop it^)
echo Your custom games, saves and stats are stored in this browser at that exact address - always use http://localhost:5174
echo.
call npm run preview -- --open --port 5174 --strictPort
if errorlevel 1 (
  echo.
  echo The server stopped with an error. If port 5174 is busy, close the other copy of the app and try again.
  pause
)
