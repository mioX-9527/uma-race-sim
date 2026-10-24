@echo off
rem uma-race-sim launcher: opens the self-contained single-file build (no install, no network)
rem (points at apps\web\dist\index.html; a Chinese-named copy "打开模拟器.html" also sits here)
start "" "%~dp0apps\web\dist\index.html"
