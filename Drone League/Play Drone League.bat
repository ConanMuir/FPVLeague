@echo off
rem Opens Drone League in its own app window (Microsoft Edge app mode)
start "" msedge --app="%~dp0standalone\index.html" --start-maximized
