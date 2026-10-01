@echo off
setlocal
cd /d "%~dp0"
where java >nul 2>nul
if errorlevel 1 (
  echo Java 17 or 21 is needed only for this local developer demo.
  echo End users of the deployed website do not need Java.
  echo https://adoptium.net/temurin/releases/?version=21
  pause
  exit /b 1
)
if not exist "release\courseflow.jar" (
  echo Build the project first using Build-Demo.cmd, or use the packaged runnable release.
  pause
  exit /b 1
)
echo CourseFlow will be available at http://localhost:8080 after startup.
echo Keep this window open. Press Ctrl+C to stop. No real email will be sent.
java -jar "release\courseflow.jar" --spring.profiles.active=demo
pause
