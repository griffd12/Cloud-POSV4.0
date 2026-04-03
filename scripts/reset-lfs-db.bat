@echo off
REM ============================================
REM  Drop and Recreate LFS PostgreSQL Database
REM ============================================
REM  Run this on the LFS Windows machine
REM  before starting the new LFS build.
REM ============================================

set /p PGPASSWORD="Enter PostgreSQL password: "
set PGUSER=postgres
set PGHOST=localhost
set PGPORT=5432
set DBNAME=pos_lfs

echo.
echo Dropping database "%DBNAME%"...
psql -U %PGUSER% -h %PGHOST% -p %PGPORT% -c "DROP DATABASE IF EXISTS %DBNAME%;"

echo Creating database "%DBNAME%"...
psql -U %PGUSER% -h %PGHOST% -p %PGPORT% -c "CREATE DATABASE %DBNAME%;"

echo.
echo Done! Database "%DBNAME%" has been recreated.
echo Start the LFS application — tables will be created automatically.
echo Config data will sync down from cloud on first sync cycle.
pause
