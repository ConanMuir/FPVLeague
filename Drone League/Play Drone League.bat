@echo off
rem Opens the Drone League launcher (League, Dogfight, Interceptor + Zombies, Jared's build) via the local web server in the repo root.
rem Close the server window to stop it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0..\serve.ps1"
