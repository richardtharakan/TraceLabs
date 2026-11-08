@echo off
setlocal
set GRADLE_VERSION=8.11.1
if "%GRADLE_USER_HOME%"=="" set GRADLE_USER_HOME=%USERPROFILE%\.gradle
set TRACE_GRADLE_ROOT=%GRADLE_USER_HOME%\tracelab-distributions
set TRACE_GRADLE_HOME=%TRACE_GRADLE_ROOT%\gradle-%GRADLE_VERSION%
set TRACE_GRADLE_ZIP=%TRACE_GRADLE_ROOT%\gradle-%GRADLE_VERSION%-bin.zip
if not exist "%TRACE_GRADLE_HOME%\bin\gradle.bat" (
  if not exist "%TRACE_GRADLE_ROOT%" mkdir "%TRACE_GRADLE_ROOT%"
  if not exist "%TRACE_GRADLE_ZIP%" (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing 'https://services.gradle.org/distributions/gradle-%GRADLE_VERSION%-bin.zip' -OutFile '%TRACE_GRADLE_ZIP%'"
    if errorlevel 1 exit /b 1
  )
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%TRACE_GRADLE_ZIP%' -DestinationPath '%TRACE_GRADLE_ROOT%' -Force"
  if errorlevel 1 exit /b 1
)
call "%TRACE_GRADLE_HOME%\bin\gradle.bat" %*
exit /b %ERRORLEVEL%
