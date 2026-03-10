#!/bin/bash
# ================================================
# IELTS Copilot - 一键部署到腾讯云服务器
# ================================================
set -e

# === 配置 ===
SERVER_IP="193.112.79.136"
SERVER_USER="root"
REMOTE_DIR="/opt/ielts-copilot"
PORT=8391

# 颜色
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# === 检查 SSH 连接 ===
echo ""
echo "========================================="
echo "  IELTS Copilot 部署工具"
echo "  服务器: ${SERVER_IP}:${PORT}"
echo "========================================="
echo ""

# === 命令分支 ===
case "${1:-deploy}" in

# --- 首次安装 ---
setup)
    warn "即将在服务器上安装 Docker 环境..."
    
    ssh ${SERVER_USER}@${SERVER_IP} << 'REMOTE_SETUP'
    set -e
    echo ">>> 更新系统..."
    apt-get update -qq
    
    # Install Docker if not present
    if ! command -v docker &>/dev/null; then
        echo ">>> 安装 Docker..."
        curl -fsSL https://get.docker.com | sh
        systemctl enable docker
        systemctl start docker
    else
        echo ">>> Docker 已安装"
    fi
    
    # Install Docker Compose plugin if not present
    if ! docker compose version &>/dev/null; then
        echo ">>> 安装 Docker Compose..."
        apt-get install -y docker-compose-plugin
    else
        echo ">>> Docker Compose 已安装"
    fi
    
    docker --version
    docker compose version
    echo ">>> Docker 环境就绪！"
REMOTE_SETUP

    log "服务器 Docker 环境安装完成！"
    echo ""
    warn "接下来请运行: ./deploy.sh password <你的密码>"
    warn "然后运行:     ./deploy.sh deploy"
    ;;

# --- 设置访问密码 ---
password)
    if [ -z "$2" ]; then
        err "请提供密码: ./deploy.sh password <你的密码>"
    fi
    
    PASSWORD="$2"
    USERNAME="${3:-ielts}"
    
    # 在本地用 openssl 生成 htpasswd
    if command -v htpasswd &>/dev/null; then
        htpasswd -cb nginx/.htpasswd "$USERNAME" "$PASSWORD"
    elif command -v openssl &>/dev/null; then
        HASH=$(openssl passwd -apr1 "$PASSWORD")
        echo "${USERNAME}:${HASH}" > nginx/.htpasswd
    else
        err "需要 htpasswd 或 openssl 命令"
    fi
    
    log "密码已设置！用户名: ${USERNAME}"
    ;;

# --- 部署/更新 ---
deploy)
    # 检查密码文件
    if [ ! -f "nginx/.htpasswd" ]; then
        err "请先设置密码: ./deploy.sh password <你的密码>"
    fi
    
    log "同步项目文件到服务器..."
    
    # 创建远程目录
    ssh ${SERVER_USER}@${SERVER_IP} "mkdir -p ${REMOTE_DIR}/backend-data/uploads"
    
    # rsync 同步（排除不需要的文件）
    rsync -avz --delete \
        --exclude '.git' \
        --exclude '.DS_Store' \
        --exclude '.codebuddy' \
        --exclude '__pycache__' \
        --exclude '*.pyc' \
        --exclude 'node_modules' \
        --exclude '.next' \
        --exclude 'backend/.venv' \
        --exclude 'backend/data' \
        --exclude 'backend-data' \
        --exclude '.backend.pid' \
        --exclude '.frontend.pid' \
        --exclude '*.log' \
        --exclude '.env' \
        --exclude '.env.local' \
        --exclude '.env.production' \
        "${PROJECT_DIR}/" "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"
    
    log "文件同步完成"
    
    log "在服务器上构建并启动服务..."
    ssh ${SERVER_USER}@${SERVER_IP} << REMOTE_DEPLOY
    set -e
    cd ${REMOTE_DIR}
    
    echo ">>> 构建 Docker 镜像..."
    docker compose build --no-cache
    
    echo ">>> 启动服务..."
    docker compose up -d --force-recreate
    
    echo ">>> 等待服务启动..."
    sleep 5
    
    echo ">>> 服务状态:"
    docker compose ps
REMOTE_DEPLOY

    log "部署完成！"
    echo ""
    echo "========================================="
    echo -e "  访问地址: ${GREEN}http://${SERVER_IP}:${PORT}${NC}"
    echo "  用户名密码: 你设置的那个"
    echo "========================================="
    ;;

# --- 快速更新（不重新构建） ---
update)
    log "快速同步代码到服务器..."
    
    rsync -avz --delete \
        --exclude '.git' \
        --exclude '.DS_Store' \
        --exclude '.codebuddy' \
        --exclude '__pycache__' \
        --exclude '*.pyc' \
        --exclude 'node_modules' \
        --exclude '.next' \
        --exclude 'backend/.venv' \
        --exclude 'backend/data' \
        --exclude 'backend-data' \
        --exclude '.backend.pid' \
        --exclude '.frontend.pid' \
        --exclude '*.log' \
        --exclude '.env' \
        --exclude '.env.local' \
        --exclude '.env.production' \
        "${PROJECT_DIR}/" "${SERVER_USER}@${SERVER_IP}:${REMOTE_DIR}/"
    
    log "文件同步完成，重新构建并重启..."
    ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR} && docker compose build && docker compose up -d"
    
    log "更新完成！"
    ;;

# --- 查看状态 ---
status)
    ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR} && docker compose ps"
    ;;

# --- 查看日志 ---
logs)
    SERVICE="${2:-}"
    if [ -n "$SERVICE" ]; then
        ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR} && docker compose logs -f --tail=100 ${SERVICE}"
    else
        ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR} && docker compose logs -f --tail=100"
    fi
    ;;

# --- 停止 ---
stop)
    ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR} && docker compose down"
    log "服务已停止"
    ;;

# --- 重启 ---
restart)
    ssh ${SERVER_USER}@${SERVER_IP} "cd ${REMOTE_DIR} && docker compose restart"
    log "服务已重启"
    ;;

# --- 帮助 ---
*)
    echo "用法: ./deploy.sh <command>"
    echo ""
    echo "命令:"
    echo "  setup       首次安装：在服务器上安装 Docker"
    echo "  password    设置访问密码: ./deploy.sh password <密码> [用户名]"
    echo "  deploy      完整部署（同步+构建+启动）"
    echo "  update      快速更新（同步+重新构建+重启）"
    echo "  status      查看服务状态"
    echo "  logs        查看日志（可指定服务: logs backend/frontend/nginx）"
    echo "  stop        停止服务"
    echo "  restart     重启服务"
    echo ""
    ;;
esac
