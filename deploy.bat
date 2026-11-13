@echo off
setlocal EnableExtensions
title Lanyard deploy and GitHub

REM Always run relative to this .bat's folder, no matter where it is launched.
cd /d "%~dp0"

echo ============================================
echo   Lanyard - deploy and GitHub
echo   %CD%
echo ============================================
echo.

REM ---- Prerequisite checks ---------------------------------------------------
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found on PATH. Install Node.js: https://nodejs.org
  goto :fail
)

where git >nul 2>nul
if errorlevel 1 (
  echo [ERROR] git not found on PATH. Install Git for Windows: https://git-scm.com
  goto :fail
)

if not exist ".git" (
  echo [ERROR] This folder is not a git repository.
  goto :fail
)

if not exist "package.json" (
  echo [ERROR] package.json not found in %CD%
  goto :fail
)

if not exist "wrangler.production.toml" (
  echo [ERROR] wrangler.production.toml missing - cannot target production.
  goto :fail
)

REM ---- Menu (shows git status every time) -------------------------------------
:menu
call :gitstatus
echo.
echo What do you want to do?
echo   [1] Build + deploy only               (normal code/UI update)
echo   [2] Apply DB migrations, then deploy  (when you added a migrations\ file)
echo   [3] Apply DB migrations ONLY
echo   [G] Git history (last 10 commits)
echo   [C] Commit tracked changes, then push to GitHub
echo   [A] Add one new file to the next commit (you type its path)
echo   [P] Push local commits to GitHub only
echo   [Q] Quit
echo.
set "CHOICE="
set /p "CHOICE=Choose 1/2/3/G/C/A/P/Q [Q]: "
if not defined CHOICE set "CHOICE=Q"

if /I "%CHOICE%"=="Q" goto :eof
if /I "%CHOICE%"=="1" goto :do_deploy
if /I "%CHOICE%"=="2" goto :do_migrate_deploy
if /I "%CHOICE%"=="3" goto :do_migrate
if /I "%CHOICE%"=="G" goto :do_history
if /I "%CHOICE%"=="C" goto :do_commit
if /I "%CHOICE%"=="A" goto :do_add
if /I "%CHOICE%"=="P" goto :do_push
echo Invalid choice.
pause
goto :menu

REM ---- Git actions -----------------------------------------------------------
:do_history
echo.
git log -10 --format="%%h  %%ad  %%an  %%s" --date=short
echo.
pause
goto :menu

:do_add
echo.
set "NEWFILE="
set /p "NEWFILE=Path of the new file to add (blank to cancel): "
if not defined NEWFILE goto :menu
git add -- "%NEWFILE%"
if errorlevel 1 (
  echo [ERROR] Could not add that file.
  pause
)
goto :menu

:do_commit
echo.
echo Tracked files with changes. Lanyard-Vault\.obsidian is always left out.
git diff --name-only -- . ":(exclude)Lanyard-Vault/.obsidian"
echo.
set "MSG="
set /p "MSG=Commit message, one line, no double quotes (blank to cancel): "
if not defined MSG goto :menu
set "SURE="
set /p "SURE=Commit these and push to GitHub? [y/N]: "
if /I not "%SURE%"=="y" (
  echo Cancelled. Nothing committed.
  pause
  goto :menu
)
git add -u -- . ":(exclude)Lanyard-Vault/.obsidian"
git commit -m "%MSG%"
if errorlevel 1 (
  echo [ERROR] Commit failed - nothing was pushed.
  pause
  goto :menu
)
call :gitpush
pause
goto :menu

:do_push
echo.
set "SURE="
set /p "SURE=Push your local commits to GitHub now? [y/N]: "
if /I not "%SURE%"=="y" goto :menu
call :gitpush
pause
goto :menu

REM ---- Deploy and migrations -------------------------------------------------
:do_deploy
call :cflogin
if errorlevel 1 goto :fail
goto :do_build

:do_migrate_deploy
call :cflogin
if errorlevel 1 goto :fail
call :runmigrations
if errorlevel 1 goto :fail
goto :do_build

:do_migrate
call :cflogin
if errorlevel 1 goto :fail
call :runmigrations
if errorlevel 1 goto :fail
echo.
echo Migrations applied. Nothing was deployed.
pause
goto :menu

:do_build
echo.
echo [2/4] Building frontend...
call npm run build
if errorlevel 1 (
  echo [ERROR] Build failed - deploy NOT run.
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
goto :done

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
echo   DID NOT COMPLETE - see messages above.
echo ============================================
echo.
pause
exit /b 1

REM ---- Subroutines -----------------------------------------------------------
:cflogin
echo Checking Cloudflare login...
call npx wrangler whoami >nul 2>nul
if not errorlevel 1 (
  echo       OK
  exit /b 0
)
echo       Not logged in - launching browser login...
call npx wrangler login
if errorlevel 1 (
  echo [ERROR] Wrangler login failed or cancelled.
  exit /b 1
)
exit /b 0

:runmigrations
echo.
echo [DB] Applying pending migrations to REMOTE D1 (auto-confirming prompt)...
echo y| call npx wrangler d1 migrations apply lanyard_db --remote --config wrangler.production.toml
if errorlevel 1 (
  echo [ERROR] Migration failed - deploy NOT run.
  exit /b 1
)
exit /b 0

:gitstatus
echo ============================================
echo   GitHub status
echo ============================================
echo   Branch:
git branch --show-current
echo   Remote:
git remote get-url origin 2>nul
echo   Latest commit:
git log -1 --format="    %%h  %%ad  %%an%%n    %%s" --date=short
echo   Commits not yet pushed:
git rev-list --count @{u}..HEAD 2>nul
echo   Tracked files changed, not committed (includes Lanyard-Vault\.obsidian):
git diff --name-only | find /c /v ""
echo   New files not yet added:
git ls-files --others --exclude-standard | find /c /v ""
exit /b 0

:gitpush
echo.
echo Pushing to GitHub (origin)...
git push origin HEAD
if errorlevel 1 (
  echo [ERROR] Push failed. Check the messages above.
  exit /b 1
)
echo.
echo Pushed. Latest commit now on GitHub:
git log -1 --format="    %%h  %%ad  %%an%%n    %%s" --date=short
exit /b 0
