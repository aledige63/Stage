@echo off
setlocal
title Stage
rem Stage launcher (Windows): starts the local server if needed and opens Stage in Chrome.
rem Avvio di Stage (Windows): avvia il server locale se serve e apre Stage in Chrome.
cd /d "%~dp0app"
set "URL=http://localhost:5173"

rem --- Node.js -------------------------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "PATH=%ProgramFiles%\nodejs;%PATH%"
  ) else (
    echo Node.js non trovato / not found: https://nodejs.org ^(LTS^)
    pause
    exit /b 1
  )
)

rem --- Server gia' attivo? -------------------------------------------------
curl -s -o nul "%URL%" && goto apri

rem --- Prima installazione delle dipendenze --------------------------------
if not exist "node_modules" (
  echo Prima installazione delle dipendenze / Installing dependencies ^(first run^)...
  call npm install
  if errorlevel 1 (
    echo Installazione non riuscita / Install failed
    pause
    exit /b 1
  )
)

rem --- Avvio del server in una finestra separata (chiuderla ferma Stage) ---
echo Avvio di Stage / Starting Stage...
start "Stage - server (chiudi per fermare / close to stop)" /min cmd /k "npm run dev -- --port 5173 --strictPort"

set /a tentativi=0
:attendi
timeout /t 1 /nobreak >nul
curl -s -o nul "%URL%" && goto apri
set /a tentativi+=1
if %tentativi% lss 40 goto attendi
echo Il server non risponde / The server is not responding: see the "Stage - server" window
pause
exit /b 1

rem --- Apertura in Chrome (in mancanza, browser predefinito) ---------------
:apri
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" "%URL%"
) else (
  echo Chrome non trovato, apro il browser predefinito / Chrome not found, opening the default browser
  start "" "%URL%"
)
exit /b 0
