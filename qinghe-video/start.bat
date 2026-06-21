@echo off
chcp 65001 >nul
title 青禾映画 MVP

cd /d "%~dp0"

echo [青禾映画] 启动后端 FastAPI...
start "qinghe-backend" cmd /k "uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload"

echo [青禾映画] 启动前端 Streamlit...
start "qinghe-frontend" cmd /k "streamlit run frontend/app.py --server.port 18510 --server.headless true"

echo.
echo [青禾映画] 服务已启动：
echo   前端: http://localhost:18510
echo   后端: http://localhost:18739/docs
echo.
pause
