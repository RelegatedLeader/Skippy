@echo off
title Skippy — Personal AI
echo.
echo  ╔══════════════════════════════════════╗
echo  ║         SKIPPY — Personal AI         ║
echo  ╚══════════════════════════════════════╝
echo.

REM Set working directory to script location
cd /d "%~dp0"

REM Load .env if it exists
if exist ".env" (
    for /f "tokens=1,* delims==" %%a in (.env) do (
        if not "%%a"=="" if not "%%a:~0,1%"=="#" set "%%a=%%b"
    )
)

REM Check for Node.js
where node >nul 2>nul
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install from https://nodejs.org
    pause
    exit /b 1
)

REM Check for API key
if "%GROK_API_KEY%"=="" (
    echo WARNING: GROK_API_KEY not set.
    echo Create a .env file with: GROK_API_KEY=your_key_here
    echo.
)

REM Check if built
if not exist ".next" (
    echo First run detected — building Skippy...
    echo This will take 1-2 minutes.
    echo.
    call npm install
    call npm run build
)

REM Check if database needs initialization
if not exist "prisma\skippy.db" (
    echo Initializing database...
    call npm run db:push
)

echo Starting Skippy...
set PORT=3747
set HOSTNAME=127.0.0.1

REM Start server
start /b node server-standalone.js

REM Wait for server to be ready
echo Waiting for server to start...
:wait_loop
timeout /t 1 /nobreak >nul
curl -s http://127.0.0.1:3747 >nul 2>nul
if errorlevel 1 goto wait_loop

REM Open browser
echo Opening Skippy in your browser...
start http://127.0.0.1:3747

echo.
echo ✓ Skippy is running at http://127.0.0.1:3747
echo   Press Ctrl+C or close this window to stop.
echo.

REM Keep window open
pause
