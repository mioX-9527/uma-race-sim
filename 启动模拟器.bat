@echo off
rem uma-race-sim launcher: open the self-contained single-file build.
rem No Node and no network needed. dist/ is git-ignored, so prefer any
rem single-file *.html that ships next to this launcher (any file name).
setlocal
set "TARGET="
for %%F in ("%~dp0*.html") do if not defined TARGET set "TARGET=%%~F"
if defined TARGET (
  start "" "%TARGET%"
  exit /b 0
)
if exist "%~dp0apps\web\dist\index.html" (
  start "" "%~dp0apps\web\dist\index.html"
  exit /b 0
)
echo Build not found. Run: npm install, then npm run build
pause
