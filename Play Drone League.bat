@echo off
rem Starts a small local web server for this folder and opens Drone League (games/drone-league/, in a Microsoft Edge app window).
rem Close the server window to stop it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1"
