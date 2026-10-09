@echo off
REM Starts VieMeal on this PC: database (port 5433), API (4100) and web app (5174).
REM Double-click to run. Close the windows to stop.
cd /d "%~dp0"

if exist "local-postgres\pg\bin\postgres.exe" (
  start "VieMeal DB" /min cmd /c "cd /d %~dp0local-postgres && pg\bin\postgres.exe -D data -p 5433"
  timeout /t 3 /nobreak >nul
) else (
  echo No local-postgres folder found. Make sure PostgreSQL is running on port 5433 ^(e.g. docker compose up -d^).
)

start "VieMeal API" cmd /k "cd /d %~dp0server && npm start"
start "VieMeal Web" cmd /k "cd /d %~dp0client && npm run dev"
timeout /t 5 /nobreak >nul
start "" http://localhost:5174
