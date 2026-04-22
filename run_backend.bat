@echo off
echo Starting Backend Server...
cd c:\Legal-TechAI
uvicorn backend.main:app --reload --port 8000
pause
