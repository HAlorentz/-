@echo off
chcp 65001 >nul
cd /d "%~dp0"

set "NODE=node"
if not exist "%NODE%" set NODE=node

"%NODE%" tools\whats-changed.js %*

pause
