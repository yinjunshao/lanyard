@echo off
rem Deploys the locked-down demo to https://lanyard.musea-moderation.workers.dev
rem This REPLACES the old v1 hackathon app at that address. lanyd.fyi (lanyard-v2) is not touched.
cd /d "%~dp0"
echo Deploying the Lanyard demo over the old v1 address...
call npx wrangler deploy --config demo-v1\wrangler.toml
echo.
pause
