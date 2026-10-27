@echo off
setlocal EnableExtensions EnableDelayedExpansion
title Lanyard v2 deploy

REM Always run relative to this .bat's folder, no matter where it is launched.
cd /d "%~dp0"

echo ============================================
echo   Lanyard v2 -^> workers.dev deploy
echo   %CD%
echo ============================================
echo.

REM ---- Prerequisite checks ---------------------------------------------------
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found on PATH. Install Node.js: https://nodejs.org
  goto :fail
)

if not exist "package.json" (
  echo [ERROR] package.json not found in %CD%
  echo         Make sure this .bat lives in the lanyard project root.
  goto :fail
)

if not exist "wrangler.production.toml" (
  echo [ERROR] wrangler.production.toml missing -^> cannot target production.
  goto :fail
)

REM ---- Wrangler login check --------------------------------------------------
echo [1/4] Checking Cloudflare login...
call npx wrangler whoami >nul 2>nul
if errorlevel 1 (
  echo       Not logged in - launching browser login...
  call npx wrangler login
  if errorlevel 1 (
    echo [ERROR] Wrangler login failed/cancelled.
    goto :fail
  )
)
echo       OK
echo.

REM ---- Menu ------------------------------------------------------------------
echo What do you want to do?
echo   [1] Build + deploy only               (normal code/UI update)
echo   [2] Apply DB migrations, then deploy  (when you added a migrations\ file)
echo   [3] Apply DB migrations ONLY
echo   [Q] Quit
echo.
set "CHOICE="
set /p "CHOICE=Choose 1/2/3/Q [1]: "
if not defined CHOICE set "CHOICE=1"

if /I "%CHOICE%"=="Q" goto :eof
if /I "%CHOICE%"=="3" goto :migrations
if /I "%CHOICE%"=="2" goto :migrations_then_deploy
if /I "%CHOICE%"=="1" goto :deploy
echo Invalid choice.
goto :fail

REM ---- Migrations ------------------------------------------------------------
:migrations
echo.
echo [DB] Applying pending migrations to REMOTE D1 (auto-confirming prompt)...
echo y| call npx wrangler d1 migrations apply lanyard_db --remote --config wrangler.production.toml
if errorlevel 1 (
  echo [ERROR] Migration failed -^> aborting, deploy NOT run.
  goto :fail
)
if /I "%CHOICE%"=="3" goto :done

REM ---- Build + deploy --------------------------------------------------------
:migrations_then_deploy
:deploy
echo.
echo [2/4] Building frontend...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed -^> deploy NOT run.
  goto :fail
)

echo.
echo [3/4] Deploying to Cloudflare Workers...
call npx wrangler deploy --config wrangler.production.toml
if errorlevel 1 (
  echo [ERROR] Deploy failed.
  goto :fail
)

echo.
echo [4/4] Quick health check...
call curl -s https://lanyard-v2.musea-moderation.workers.dev/api/health
echo.
echo.

:done
echo ============================================
echo   SUCCESS - live at:
echo   https://lanyard-v2.musea-moderation.workers.dev
echo   Hard-refresh the page with Ctrl+Shift+R.
echo ============================================
echo.
pause
exit /b 0

:fail
echo.
echo ============================================
echo   DEPLOY DID NOT COMPLETE - see messages above.
echo ============================================
echo.
pause
exit /b 1
