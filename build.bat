@echo off
cd /d "%~dp0"
where flex >nul 2>nul
if errorlevel 1 (echo Flex was not found in PATH. Install Flex. & pause & exit /b 1)
where bison >nul 2>nul
if errorlevel 1 (echo Bison was not found in PATH. Install Bison. & pause & exit /b 1)
where gcc >nul 2>nul
if errorlevel 1 (echo GCC was not found in PATH. Install MinGW-w64. & pause & exit /b 1)
bison -d -o src\parser.tab.c src\parser.y
if errorlevel 1 (echo Bison generation failed. & pause & exit /b 1)
flex -o src\lex.yy.c src\lexer.l
if errorlevel 1 (echo Flex generation failed. & pause & exit /b 1)
gcc -std=c11 -Wall -Wextra -O2 src\parser.tab.c src\lex.yy.c -o strlang.exe
if errorlevel 1 (echo Compilation failed. & pause & exit /b 1)
echo Build successful. Run: py server.py
pause
