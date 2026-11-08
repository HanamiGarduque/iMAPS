@echo off
REM IMAPS Excel -> PDF converter. Needs: PHP on PATH, desktop Microsoft Excel.
REM 1) Put your secret in converter.key (one line, 16+ characters), same value as PERMIT_REMOTE_KEY on Railway.
REM 2) Double-click this file, then expose port 8787 (see README.md).
cd /d "%~dp0"
if not exist converter.key (
  echo Create converter.key first. It must contain the secret key on one line.
  pause
  exit /b 1
)
set /p IMAPS_CONVERTER_KEY=<converter.key
echo Converter listening on http://127.0.0.1:8787  (Ctrl+C to stop)
php -S 127.0.0.1:8787 server.php
