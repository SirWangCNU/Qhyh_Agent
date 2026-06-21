#!/bin/bash
# 青禾映画 MVP 启动脚本（Linux / macOS / Git Bash）
# 用法：bash start.sh

set -e

cd "$(dirname "$0")"

echo "[青禾映画] 启动后端 FastAPI..."
uvicorn src.main:app --host 0.0.0.0 --port 18739 --reload &
BACKEND_PID=$!

echo "[青禾映画] 启动前端 Streamlit..."
streamlit run frontend/app.py --server.port 18510 --server.headless true &
FRONTEND_PID=$!

trap "echo '[青禾映画] 正在停止服务...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM

wait
