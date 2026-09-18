@echo off
setlocal enabledelayedexpansion
title OMI - One Mind Intelligence
cd /d "%~dp0"

echo ===================================================
echo           OMI - One Mind Intelligence
echo ===================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js is not found in your PATH.
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [*] Installing project dependencies...
    call npm.cmd install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

if not exist ".env.local" (
    if exist ".env.example" (
        copy /y ".env.example" ".env.local" >nul
        echo [*] Created .env.local
    )
)

echo [*] Launching OMI on http://localhost:3000 ...
echo [*] Keep this window open while using OMI.
echo [*] Press Ctrl+C to stop.
echo.

:: Pre-warm server and open browser once ready
start "" cmd /c "ping 127.0.0.1 -n 4 >nul & curl -s http://localhost:3000/api/runs >nul & start http://localhost:3000"

:: Start Next.js dev server
call npm.cmd run dev

if errorlevel 1 (
    echo.
    echo [!] Server stopped.
    pause
)
