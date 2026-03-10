#!/bin/bash
#
# IELTS Copilot 一键启动脚本
# 用法: ./start.sh [命令]
#   start   - 启动前后端 (默认)
#   stop    - 停止所有服务
#   restart - 重启所有服务
#   status  - 查看服务状态
#   logs    - 查看后端/前端日志
#

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_PID_FILE="$PROJECT_DIR/.backend.pid"
FRONTEND_PID_FILE="$PROJECT_DIR/.frontend.pid"
BACKEND_LOG="$PROJECT_DIR/.backend.log"
FRONTEND_LOG="$PROJECT_DIR/.frontend.log"
VENV_DIR="$BACKEND_DIR/.venv"

info()  { printf "\033[0;34m[INFO]\033[0m %s\n" "$1"; }
ok()    { printf "\033[0;32m[ OK ]\033[0m %s\n" "$1"; }
warn()  { printf "\033[1;33m[WARN]\033[0m %s\n" "$1"; }
err()   { printf "\033[0;31m[ERR ]\033[0m %s\n" "$1"; }

# ─── 停止服务 ───
do_stop() {
    info "停止所有服务..."
    for pf in "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"; do
        if [ -f "$pf" ]; then
            local pid; pid=$(cat "$pf")
            kill "$pid" 2>/dev/null && ok "已停止 PID $pid"
            rm -f "$pf"
        fi
    done
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    ok "所有服务已停止"
}

# ─── 查看状态 ───
do_status() {
    echo ""
    echo "======================================="
    echo "  IELTS Copilot 服务状态"
    echo "======================================="
    if [ -f "$BACKEND_PID_FILE" ] && kill -0 "$(cat "$BACKEND_PID_FILE")" 2>/dev/null; then
        printf "  后端:  \033[0;32m● 运行中\033[0m  PID: %s  http://localhost:8000\n" "$(cat "$BACKEND_PID_FILE")"
    else
        printf "  后端:  \033[0;31m● 已停止\033[0m\n"
    fi
    if [ -f "$FRONTEND_PID_FILE" ] && kill -0 "$(cat "$FRONTEND_PID_FILE")" 2>/dev/null; then
        printf "  前端:  \033[0;32m● 运行中\033[0m  PID: %s  http://localhost:3000\n" "$(cat "$FRONTEND_PID_FILE")"
    else
        printf "  前端:  \033[0;31m● 已停止\033[0m\n"
    fi
    echo "======================================="
    echo ""
}

# ─── 查看日志 ───
do_logs() {
    case "${1:-all}" in
        backend|b)  tail -50 "$BACKEND_LOG" 2>/dev/null || echo "暂无日志" ;;
        frontend|f) tail -50 "$FRONTEND_LOG" 2>/dev/null || echo "暂无日志" ;;
        *)
            echo "--- 后端日志 (最后20行) ---"
            tail -20 "$BACKEND_LOG" 2>/dev/null || echo "暂无日志"
            echo ""
            echo "--- 前端日志 (最后20行) ---"
            tail -20 "$FRONTEND_LOG" 2>/dev/null || echo "暂无日志"
            ;;
    esac
}

# ─── 主启动 ───
do_start() {
    echo ""
    echo "======================================="
    echo "  IELTS Copilot 启动中..."
    echo "======================================="
    echo ""

    # 检查依赖
    command -v python3 >/dev/null || { err "未找到 python3"; exit 1; }
    command -v node >/dev/null    || { err "未找到 node"; exit 1; }
    command -v npm >/dev/null     || { err "未找到 npm"; exit 1; }

    # ─── 后端环境 ───
    info "检查后端环境..."
    if [ ! -d "$VENV_DIR" ]; then
        info "创建 Python 虚拟环境..."
        python3 -m venv "$VENV_DIR"
    fi

    # shellcheck disable=SC1091
    . "$VENV_DIR/bin/activate"

    # 依赖检查（通过 hash 对比）
    local req_hash
    req_hash=$(md5 -q "$BACKEND_DIR/requirements.txt" 2>/dev/null || md5sum "$BACKEND_DIR/requirements.txt" | cut -d' ' -f1)
    local hash_file="$VENV_DIR/.req_hash"

    if [ ! -f "$hash_file" ] || [ "$(cat "$hash_file")" != "$req_hash" ]; then
        info "安装/更新后端依赖..."
        pip install -r "$BACKEND_DIR/requirements.txt" -q 2>&1 | tail -3
        echo "$req_hash" > "$hash_file"
        ok "后端依赖就绪"
    else
        ok "后端依赖已是最新"
    fi

    # ─── 前端环境 ───
    info "检查前端环境..."
    if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
        info "安装前端依赖..."
        cd "$FRONTEND_DIR" && npm install --silent 2>&1 | tail -3
        ok "前端依赖就绪"
    else
        ok "前端依赖已是最新"
    fi

    # ─── 释放端口 ───
    lsof -ti:8000 | xargs kill -9 2>/dev/null || true
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"
    sleep 1

    # ─── 启动后端 ───
    info "启动后端 (http://localhost:8000)..."
    . "$VENV_DIR/bin/activate"
    cd "$BACKEND_DIR"
    nohup python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
        > "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"

    # 等待后端就绪
    local i=0
    while [ $i -lt 15 ]; do
        if curl -s http://localhost:8000/api/health >/dev/null 2>&1; then
            ok "后端启动成功 (PID: $(cat "$BACKEND_PID_FILE"))"
            break
        fi
        i=$((i + 1))
        sleep 1
    done
    if [ $i -eq 15 ]; then
        warn "后端启动较慢，请稍候... (查看日志: ./start.sh logs backend)"
    fi

    # ─── 启动前端 ───
    info "启动前端 (http://localhost:3000)..."
    cd "$FRONTEND_DIR"
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"

    # 等待前端就绪
    i=0
    while [ $i -lt 15 ]; do
        if curl -s http://localhost:3000 >/dev/null 2>&1; then
            ok "前端启动成功 (PID: $(cat "$FRONTEND_PID_FILE"))"
            break
        fi
        i=$((i + 1))
        sleep 1
    done
    if [ $i -eq 15 ]; then
        ok "前端启动中 (PID: $(cat "$FRONTEND_PID_FILE"))，请稍候..."
    fi

    echo ""
    echo "======================================="
    echo "  IELTS Copilot 启动完成!"
    echo ""
    echo "  前端: http://localhost:3000"
    echo "  后端: http://localhost:8000"
    echo "  API:  http://localhost:8000/docs"
    echo ""
    echo "  停止: ./start.sh stop"
    echo "  状态: ./start.sh status"
    echo "  日志: ./start.sh logs [backend|frontend]"
    echo "======================================="
    echo ""
}

# ─── 入口 ───
case "${1:-start}" in
    start)   do_start ;;
    stop)    do_stop ;;
    restart) do_stop; sleep 2; do_start ;;
    status)  do_status ;;
    logs)    do_logs "$2" ;;
    *)       echo "用法: $0 {start|stop|restart|status|logs [backend|frontend]}"; exit 1 ;;
esac
