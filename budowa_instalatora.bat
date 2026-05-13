@echo off
cd /d "%~dp0"
echo Budowanie instalatora...
npm run build
if %ERRORLEVEL% neq 0 (
    echo.
    echo BLAD: budowanie nieudane (kod %ERRORLEVEL%)
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo Gotowe! Instalator znajduje sie w folderze dist\
pause
