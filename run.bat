@echo off
echo ========================================
echo   Freepik Video Generation Tester
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js installation...
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

echo Checking npm installation...
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    pause
    exit /b 1
)

echo Checking if node_modules exists...
if not exist "node_modules\" (
    echo node_modules not found. Installing dependencies...
    npm install
    if %ERRORLEVEL% neq 0 (
        echo ERROR: Failed to install dependencies
        pause
        exit /b 1
    )
)

echo Checking .env file...
if not exist ".env" (
    echo WARNING: .env file not found
    echo Please create .env file with your API key
    pause
)

echo.
echo Starting Freepik Video Tester...
echo.

npm start

if %ERRORLEVEL% neq 0 (
    echo.
    echo ERROR: Application failed to start
    pause
    exit /b 1
)
