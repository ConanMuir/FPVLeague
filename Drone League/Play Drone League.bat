@echo off
rem Opens Drone League (League, Dogfight, Freeplay, Training; its menu links to the Interceptor) via the local web server in the repo root.
rem Close the server window to stop it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\serve.ps1"
