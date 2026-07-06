@echo off
echo Starting MindMatters backend...
cd /d "%~dp0packages\backend"
set NODE_ENV=dev
node src/index.js
pause
