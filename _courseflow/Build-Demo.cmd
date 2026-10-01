@echo off
setlocal
cd /d "%~dp0"
where java >nul 2>nul
if errorlevel 1 goto missing
where npm.cmd >nul 2>nul
if errorlevel 1 goto missing
pushd frontend
call npm.cmd ci --no-audit --no-fund
if errorlevel 1 goto failed
call npm.cmd run build
if errorlevel 1 goto failed
popd
if not exist "backend\src\main\resources\static" mkdir "backend\src\main\resources\static"
xcopy "frontend\dist\*" "backend\src\main\resources\static\" /e /i /y >nul
pushd backend
call mvnw.cmd -B -ntp verify
if errorlevel 1 goto failed
popd
if not exist release mkdir release
copy /y "backend\target\courseflow-0.2.0.jar" "release\courseflow.jar" >nul
echo Build complete. Double-click Start-Demo.cmd.
pause
exit /b 0
:missing
echo Developer build requires a JDK 17+ and Node.js 24 LTS.
echo Regular website users do not need these tools.
pause
exit /b 1
:failed
echo Build failed. Send the error output for help.
pause
exit /b 1
