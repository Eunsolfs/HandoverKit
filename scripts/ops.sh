#!/usr/bin/env bash
# 易交接 HandoverKit 一键安装 / 运维脚本
#
# 最简用法（在 Linux 服务器上）：
#   curl -fsSL https://github.com/Eunsolfs/HandoverKit/releases/latest/download/handoverkit-ops.sh -o /tmp/ops.sh
#   sudo bash /tmp/ops.sh install
#
# 常用命令：
#   sudo bash ops.sh install             安装并启动（默认目录 /opt/handoverkit，端口 8080）
#   sudo bash ops.sh upgrade [tag]       升级到指定版本（默认 latest），升级前自动备份
#   sudo bash ops.sh status              查看状态与健康检查
#   sudo bash ops.sh logs                跟踪应用日志
#   sudo bash ops.sh backup [备注]       备份数据库与环境变量
#   sudo bash ops.sh restore <备份文件>  从备份恢复（会二次确认）
#   sudo bash ops.sh rollback            回滚到上一次升级前的镜像
#   sudo bash ops.sh restart             重启应用
#   sudo bash ops.sh uninstall           卸载容器（可选删除数据卷）
#   sudo bash ops.sh menu                交互式菜单（无参数时默认）
#
# 可通过环境变量覆盖：HK_DIR / HK_IMAGE / HK_PORT / HK_URL / SEED_ADMIN_* / HK_REPO
set -Eeuo pipefail

SCRIPT_VERSION="1.0.0"
HK_REPO="${HK_REPO:-Eunsolfs/HandoverKit}"
HK_DIR="${HK_DIR:-/opt/handoverkit}"
DEFAULT_IMAGE_TAG="latest"
DEFAULT_IMAGE="ghcr.io/$(printf '%s' "$HK_REPO" | tr '[:upper:]' '[:lower:]'):$DEFAULT_IMAGE_TAG"

ENV_FILE="$HK_DIR/.env"
COMPOSE_FILE="$HK_DIR/docker-compose.yml"
BACKUP_DIR="$HK_DIR/backups"
DATA_VOLUME="handoverkit_data"
APP_PORT_DEFAULT="8080"
HEALTH_PATH="/api/health"
ENV_CREATED=0
DRY_RUN="${HK_DRY_RUN:-0}"

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'
else
  C_RESET=""; C_BOLD=""; C_GREEN=""; C_YELLOW=""; C_RED=""
fi

info() { printf '%s[信息]%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn() { printf '%s[警告]%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die() { printf '%s[错误]%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }
title() { printf '\n%s%s%s\n' "$C_BOLD" "$*" "$C_RESET"; }

ask() {
  local prompt="$1" default="$2" answer=""
  if [ -r /dev/tty ]; then
    printf '%s [%s]: ' "$prompt" "$default" > /dev/tty
    IFS= read -r answer < /dev/tty || answer=""
  fi
  if [ -z "$answer" ]; then printf '%s' "$default"; else printf '%s' "$answer"; fi
}

ask_secret() {
  local prompt="$1" answer=""
  if [ -r /dev/tty ]; then
    printf '%s: ' "$prompt" > /dev/tty
    IFS= read -r -s answer < /dev/tty || answer=""
    printf '\n' > /dev/tty
  fi
  printf '%s' "$answer"
}

confirm() {
  local prompt="$1" answer=""
  if [ ! -r /dev/tty ]; then
    warn "非交互环境，默认不执行：$prompt"
    return 1
  fi
  printf '%s [y/N]: ' "$prompt" > /dev/tty
  IFS= read -r answer < /dev/tty || answer=""
  case "$answer" in y|Y|yes|YES) return 0 ;; *) return 1 ;; esac
}

gen_hex() {
  local bytes="$1"
  [ -n "$bytes" ] || bytes=16
  od -An -N"$bytes" -tx1 /dev/urandom | tr -d ' \n'
}

detect_ip() {
  local ip=""
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')" || true
  if [ -z "$ip" ]; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") {print $(i+1); exit}}')" || true
  fi
  if [ -z "$ip" ]; then printf '127.0.0.1'; else printf '%s' "$ip"; fi
}

need_docker() {
  if [ "$DRY_RUN" = "1" ]; then
    info "dry-run：跳过 Docker 环境检查"
    return 0
  fi
  command -v docker >/dev/null 2>&1 || die "未安装 Docker。请先安装 Docker Engine 24+ 与 Compose v2，再重新运行。"
  docker compose version >/dev/null 2>&1 || die "缺少 docker compose 插件（Compose v2）。请安装 docker-compose-plugin 后重试。"
  docker info >/dev/null 2>&1 || die "当前用户无法访问 Docker。请使用 root 或 sudo 运行，或把用户加入 docker 组。"
}

compose() {
  docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

get_env() {
  local key="$1" fallback="$2" value=""
  if [ -f "$ENV_FILE" ]; then
    value="$(awk -F= -v k="$key" '$1 == k { sub(/^[^=]*=/, ""); print; exit }' "$ENV_FILE")"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi
  if [ -z "$value" ]; then printf '%s' "$fallback"; else printf '%s' "$value"; fi
}

set_env() {
  local key="$1" value="$2" tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (done == 0) print k "=" v }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

require_installed() {
  [ -f "$ENV_FILE" ] || die "尚未安装：$ENV_FILE 不存在。请先执行 install。"
  [ -f "$COMPOSE_FILE" ] || die "缺少 $COMPOSE_FILE，请执行 install 重新生成。"
}

app_running() {
  local cid=""
  cid="$(compose ps -q app 2>/dev/null || true)"
  [ -n "$cid" ]
}

write_env() {
  mkdir -p "$HK_DIR"
  if [ -f "$ENV_FILE" ]; then
    info "检测到已有环境配置，复用：$ENV_FILE"
    ENV_CREATED=0
    return 0
  fi

  local detected_ip port url admin_user admin_pass auth_secret
  detected_ip="$(detect_ip)"
  port="${HK_PORT:-$APP_PORT_DEFAULT}"
  url="${HK_URL:-http://$detected_ip:$port}"
  url="${url%/}"
  admin_user="${SEED_ADMIN_USERNAME:-admin}"
  admin_pass="${SEED_ADMIN_PASSWORD:-}"
  auth_secret="${BETTER_AUTH_SECRET:-}"

  if [ -r /dev/tty ] && [ -t 1 ]; then
    url="$(ask "对外访问地址（域名或 IP:端口）" "$url")"
    port="$(ask "宿主机端口" "$port")"
    if [ -z "$admin_pass" ]; then
      admin_pass="$(ask_secret "超级管理员初始密码（留空自动生成）")"
    fi
  fi

  [ -n "$admin_pass" ] || admin_pass="$(gen_hex 12)"
  [ -n "$auth_secret" ] || auth_secret="$(gen_hex 32)"

  umask 077
  cat > "$ENV_FILE" <<EOF
# 由 handoverkit-ops.sh 生成于 $(date '+%Y-%m-%d %H:%M:%S')
# 该文件包含密钥，请勿提交到 Git；备份时注意保护。
HK_IMAGE=${HK_IMAGE:-$DEFAULT_IMAGE}
APP_PORT=$port
BETTER_AUTH_URL="$url"
BETTER_AUTH_SECRET=$auth_secret
SEED_ADMIN_USERNAME=$admin_user
SEED_ADMIN_PASSWORD="$admin_pass"
SEED_ADMIN_NAME="${SEED_ADMIN_NAME:-系统管理员}"
TZ=${TZ:-Asia/Shanghai}
EOF
  chmod 600 "$ENV_FILE"
  ENV_CREATED=1
  info "已生成环境配置：$ENV_FILE"
}

write_compose() {
  mkdir -p "$HK_DIR"
  cat > "$COMPOSE_FILE" <<'COMPOSE_EOF'
# 由 handoverkit-ops.sh 生成（每次 install / upgrade 会更新本文件，请勿手改）
name: handoverkit

x-logging: &logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"

x-app: &app
  image: "${HK_IMAGE:-ghcr.io/eunsolfs/handoverkit:latest}"
  environment:
    BETTER_AUTH_URL: "${BETTER_AUTH_URL:?请在 .env 中设置 BETTER_AUTH_URL}"
    BETTER_AUTH_SECRET: "${BETTER_AUTH_SECRET:?请在 .env 中设置 BETTER_AUTH_SECRET}"
    DATABASE_URL: /data/app.db
    PORT: "3000"
    TZ: "${TZ:-Asia/Shanghai}"
    SEED_ADMIN_USERNAME: "${SEED_ADMIN_USERNAME:-admin}"
    SEED_ADMIN_PASSWORD: "${SEED_ADMIN_PASSWORD:-Admin@123456}"
    SEED_ADMIN_NAME: "${SEED_ADMIN_NAME:-系统管理员}"
    NODE_ENV: production
  volumes:
    - data:/data
  logging: *logging
  init: true
  stop_grace_period: 30s

services:
  migrate:
    <<: *app
    command: ["node", "dist/migrate.mjs"]
    restart: "no"

  app:
    <<: *app
    depends_on:
      migrate:
        condition: service_completed_successfully
    ports:
      - "${APP_PORT:-8080}:3000"
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))",
        ]
      interval: 15s
      timeout: 5s
      start_period: 20s
      retries: 3

volumes:
  data:
COMPOSE_EOF
  info "已生成编排文件：$COMPOSE_FILE"
}

pull_image() {
  local image
  image="$(get_env HK_IMAGE "$DEFAULT_IMAGE")"
  info "拉取镜像：$image"
  if ! compose pull; then
    warn "镜像拉取失败。常见原因："
    warn "  1) GHCR 包为私有：在服务器执行 docker login ghcr.io -u <GitHub用户名>（PAT 需 read:packages），或把包改为 public"
    warn "  2) 网络无法访问 ghcr.io：可在 .env 中把 HK_IMAGE 换成镜像加速地址或私有 registry 后重试"
    return 1
  fi
}

wait_health() {
  local port url i cid status
  port="$(get_env APP_PORT "$APP_PORT_DEFAULT")"
  url="http://127.0.0.1:$port$HEALTH_PATH"
  info "等待服务健康检查（最长 3 分钟）..."
  if command -v curl >/dev/null 2>&1; then
    for i in $(seq 1 90); do
      if curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
        info "健康检查通过：$url"
        return 0
      fi
      sleep 2
    done
  else
    for i in $(seq 1 90); do
      cid="$(compose ps -q app 2>/dev/null || true)"
      if [ -n "$cid" ]; then
        status="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
        if [ "$status" = "healthy" ]; then
          info "健康检查通过（容器状态 healthy）"
          return 0
        fi
      fi
      sleep 2
    done
  fi
  return 1
}

summary() {
  local url admin_user admin_pass image
  url="$(get_env BETTER_AUTH_URL "")"
  admin_user="$(get_env SEED_ADMIN_USERNAME "admin")"
  admin_pass="$(get_env SEED_ADMIN_PASSWORD "")"
  image="$(get_env HK_IMAGE "$DEFAULT_IMAGE")"
  title "易交接已就绪"
  printf '  访问地址 : %s\n' "$url"
  printf '  管理员   : %s / %s\n' "$admin_user" "$admin_pass"
  printf '  镜像     : %s\n' "$image"
  printf '  安装目录 : %s\n' "$HK_DIR"
  printf '  数据卷   : %s（SQLite: /data/app.db）\n' "$DATA_VOLUME"
  printf '  运维命令 : sudo bash %s/ops.sh status|logs|backup|upgrade|rollback\n' "$HK_DIR"
  if [ "$ENV_CREATED" = "1" ]; then
    warn "首次安装：请登录后立即修改管理员密码，并妥善保存 .env（含密钥）。"
  fi
}

copy_self() {
  local self target
  self="$(readlink -f "$0" 2>/dev/null || printf '%s' "$0")"
  [ -f "$self" ] || return 0
  target="$HK_DIR/ops.sh"
  [ "$self" = "$target" ] && return 0
  cp "$self" "$target"
  chmod +x "$target"
  info "已复制运维脚本：$target"
}

cmd_install() {
  need_docker
  mkdir -p "$HK_DIR" "$BACKUP_DIR"
  copy_self
  ENV_CREATED=0
  write_env
  write_compose
  if [ "$DRY_RUN" = "1" ]; then
    info "dry-run：已生成 $ENV_FILE 与 $COMPOSE_FILE，跳过拉取与启动。"
    return 0
  fi
  pull_image || die "无法拉取镜像，安装中止。"
  compose stop app >/dev/null 2>&1 || true
  if ! compose run --rm --no-deps migrate; then
    die "数据库迁移失败，请检查上方日志。"
  fi
  if ! compose up -d; then
    compose logs --tail=100 app || true
    die "容器启动失败，请查看上方日志。"
  fi
  if ! wait_health; then
    compose logs --tail=100 app || true
    die "服务未在预期时间内健康。请查看上方日志或执行：bash $0 logs"
  fi
  summary
}

cmd_upgrade() {
  need_docker
  require_installed
  copy_self
  local target="$1" prev repo new_image
  [ -n "$target" ] || target="latest"
  prev="$(get_env HK_IMAGE "$DEFAULT_IMAGE")"
  if printf '%s' "$target" | grep -q '/'; then
    new_image="$target"
  else
    repo="${prev%:*}"
    case "$repo" in
      */*) ;;
      *) repo="${DEFAULT_IMAGE%:*}" ;;
    esac
    new_image="$repo:$target"
  fi

  if [ "$new_image" = "$prev" ]; then
    warn "当前已经是 $new_image"
  fi
  info "升级：$prev -> $new_image"
  if app_running; then
    cmd_backup "pre-upgrade" || warn "升级前备份失败（继续升级）"
  else
    warn "应用当前未运行，跳过升级前备份"
  fi
  cp "$ENV_FILE" "$ENV_FILE.bak"
  set_env HK_IMAGE "$new_image"
  write_compose

  if ! pull_image; then
    warn "拉取失败，回滚环境变量"
    cp "$ENV_FILE.bak" "$ENV_FILE"
    die "升级中止（未改动运行中的容器）。"
  fi

  compose stop app >/dev/null 2>&1 || true
  if ! compose run --rm --no-deps migrate; then
    warn "数据库迁移失败，可执行 sudo bash $0 rollback 回滚镜像配置。"
    die "升级失败（迁移阶段）。"
  fi

  if ! compose up -d || ! wait_health; then
    warn "新版本启动失败。"
    compose logs --tail=120 app || true
    warn "可执行以下命令回滚：sudo bash $0 rollback"
    die "升级失败。"
  fi
  summary
  info "升级完成。"
}

cmd_backup() {
  require_installed
  local label="$1"
  [ -n "$label" ] || label="manual"
  label="$(printf '%s' "$label" | tr -c 'A-Za-z0-9._-' '-')"
  if ! app_running; then
    warn "应用未运行，无法在线备份。请先执行 bash $0 install（或 status 检查）。"
    return 1
  fi
  mkdir -p "$BACKUP_DIR"
  local ts tmp file
  ts="$(date +%Y%m%d-%H%M%S)"
  tmp="$(mktemp -d)"
  cleanup_tmp() { rm -rf "$tmp"; }
  trap cleanup_tmp EXIT

  local cid
  cid="$(compose ps -q app)"
  [ -n "$cid" ] || { warn "未找到 app 容器"; return 1; }
  info "检查点并导出 SQLite..."
  compose exec -T app node -e "const { DatabaseSync } = require('node:sqlite'); const db = new DatabaseSync('/data/app.db'); db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close();" >/dev/null
  docker cp "$cid:/data/app.db" "$tmp/app.db"
  cp "$ENV_FILE" "$tmp/env.bak"

  file="$BACKUP_DIR/handoverkit-$ts-$label.tar.gz"
  tar -czf "$file" -C "$tmp" app.db env.bak
  chmod 600 "$file"
  trap - EXIT
  cleanup_tmp
  info "备份完成：$file"
  printf '%s\n' "$file"
}

cmd_restore() {
  need_docker
  require_installed
  local archive="$1"
  [ -n "$archive" ] || die "用法：bash $0 restore <备份文件.tar.gz>"
  [ -f "$archive" ] || die "备份文件不存在：$archive"
  confirm "恢复会覆盖当前数据库（$DATA_VOLUME），确定继续？" || die "已取消。"
  if app_running; then
    cmd_backup "pre-restore" || warn "恢复前备份失败（继续恢复）"
  fi

  local tmp image
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  tar -xzf "$archive" -C "$tmp"
  [ -f "$tmp/app.db" ] || die "备份包中缺少 app.db"

  compose stop app || true
  image="$(get_env HK_IMAGE "$DEFAULT_IMAGE")"
  docker image inspect "$image" >/dev/null 2>&1 || docker pull "$image"
  info "写入数据库文件..."
  docker run --rm -u 0 -v "$DATA_VOLUME:/data" -v "$tmp:/restore:ro" "$image" \
    sh -c 'cp /restore/app.db /data/app.db && rm -f /data/app.db-wal /data/app.db-shm && chown 65534:65534 /data/app.db'
  trap - EXIT
  rm -rf "$tmp"
  compose up -d
  wait_health || die "恢复后健康检查失败，请查看日志。"
  info "恢复完成。"
}

cmd_rollback() {
  need_docker
  require_installed
  [ -f "$ENV_FILE.bak" ] || die "没有可用的回滚配置（$ENV_FILE.bak）。"
  info "回滚到上一次升级前的镜像..."
  cp "$ENV_FILE.bak" "$ENV_FILE"
  pull_image || die "回滚镜像拉取失败。"
  compose up -d
  wait_health || die "回滚后健康检查失败，请查看日志。"
  info "回滚完成。"
}

cmd_status() {
  need_docker
  require_installed
  title "运行状态"
  compose ps || true
  local port url
  port="$(get_env APP_PORT "$APP_PORT_DEFAULT")"
  url="http://127.0.0.1:$port$HEALTH_PATH"
  if command -v curl >/dev/null 2>&1 && curl -fsS --max-time 3 "$url" >/dev/null 2>&1; then
    info "健康检查：通过（$url）"
  else
    warn "健康检查：未通过（$url）"
  fi
  printf '镜像: %s\n' "$(get_env HK_IMAGE "$DEFAULT_IMAGE")"
  printf '访问: %s\n' "$(get_env BETTER_AUTH_URL "")"
  printf '数据卷: %s\n' "$DATA_VOLUME"
  printf '备份目录: %s\n' "$BACKUP_DIR"
}

cmd_logs() {
  require_installed
  compose logs -f --tail=200 app
}

cmd_restart() {
  need_docker
  require_installed
  compose restart app
  if wait_health; then info "重启完成。"; else die "重启后健康检查失败。"; fi
}

cmd_down() {
  need_docker
  require_installed
  compose down
  info "已停止并移除容器（数据卷保留）。"
}

cmd_uninstall() {
  need_docker
  require_installed
  confirm "停止并移除容器？数据卷会保留。" || die "已取消。"
  compose down
  if confirm "是否同时删除数据卷 $DATA_VOLUME（不可恢复）？"; then
    docker volume rm "$DATA_VOLUME" >/dev/null 2>&1 || warn "删除数据卷失败（可能不存在或仍被占用）。"
    info "数据卷已删除。"
  else
    info "数据卷已保留。"
  fi
  if confirm "是否删除安装目录 $HK_DIR（含 .env 与备份）？"; then
    if [ "$HK_DIR" = "/" ] || [ -z "$HK_DIR" ]; then die "拒绝删除根目录"; fi
    rm -rf "$HK_DIR"
    info "安装目录已删除。"
  fi
}

cmd_doctor() {
  title "环境自检"
  if command -v docker >/dev/null 2>&1; then info "Docker: $(docker --version)"; else warn "Docker: 未安装"; fi
  if docker compose version >/dev/null 2>&1; then info "Compose: $(docker compose version --short 2>/dev/null || echo v2)"; else warn "Compose: 未安装"; fi
  if docker info >/dev/null 2>&1; then info "Docker 权限: 正常"; else warn "Docker 权限: 当前用户不可用（请用 sudo）"; fi
  if command -v curl >/dev/null 2>&1; then info "curl: 可用"; else warn "curl: 未安装（健康检查将改用容器状态）"; fi
  if [ -f "$ENV_FILE" ]; then info "配置: $ENV_FILE"; else warn "配置: 未安装"; fi
  if [ -f "$COMPOSE_FILE" ]; then info "编排: $COMPOSE_FILE"; else warn "编排: 未安装"; fi
}

cmd_version() {
  printf 'handoverkit-ops %s（默认镜像 %s）\n' "$SCRIPT_VERSION" "$DEFAULT_IMAGE"
}

cmd_help() {
  cat <<'HELP'
易交接 HandoverKit 一键安装 / 运维脚本

用法：bash handoverkit-ops.sh <命令> [参数]

  install             安装并启动（默认目录 /opt/handoverkit、端口 8080）
  upgrade [tag]       升级镜像（默认 latest），升级前自动备份，失败可 rollback
  rollback            回滚到上一次升级前的镜像
  status              查看容器状态与健康检查
  logs                跟踪应用日志
  backup [备注]       在线备份 SQLite 与 .env 到安装目录/backups
  restore <文件>      从备份恢复（二次确认，恢复前自动备份）
  restart             重启应用
  down                停止并移除容器（保留数据卷）
  uninstall           卸载容器（可选删除数据卷与安装目录）
  doctor              检查 Docker/Compose/配置等环境
  version             显示脚本版本
  menu                交互式菜单（无参数且为终端时默认）

可覆盖的环境变量：
  HK_DIR=/opt/handoverkit              安装目录
  HK_IMAGE=ghcr.io/.../handoverkit:tag 镜像地址
  HK_PORT=8080                         宿主机端口
  HK_URL=http://IP:8080                对外访问地址
  SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD / SEED_ADMIN_NAME
  HK_REPO=Eunsolfs/HandoverKit         用于推导默认镜像地址

示例：
  sudo bash ops.sh install
  sudo bash ops.sh upgrade v0.1.2
  sudo bash ops.sh backup manual
  sudo bash ops.sh restore /opt/handoverkit/backups/handoverkit-20260101-120000-manual.tar.gz

提示：数据卷名为 handoverkit_data；.env 含密钥，请勿提交到 Git。
HELP
}

cmd_menu() {
  while true; do
    title "易交接运维菜单"
    cat <<'MENU'
  1) 安装 / 启动
  2) 升级到最新版（自动备份）
  3) 查看状态
  4) 备份数据库
  5) 从备份恢复
  6) 查看日志
  7) 重启
  8) 回滚上次升级
  9) 卸载
  0) 退出
MENU
    local choice=""
    printf '请选择: '
    IFS= read -r choice || break
    case "$choice" in
      1) cmd_install ;;
      2) cmd_upgrade latest ;;
      3) cmd_status ;;
      4) cmd_backup manual ;;
      5)
        printf '备份文件路径: '
        local file=""
        IFS= read -r file || file=""
        if [ -n "$file" ]; then cmd_restore "$file"; fi
        ;;
      6) cmd_logs ;;
      7) cmd_restart ;;
      8) cmd_rollback ;;
      9) cmd_uninstall ;;
      0|q|Q) break ;;
      *) warn "无效选项" ;;
    esac
  done
}

main() {
  local cmd="${1:-}"
  shift || true
  case "$cmd" in
    install) cmd_install ;;
    upgrade|update) cmd_upgrade "${1:-latest}" ;;
    rollback) cmd_rollback ;;
    status|ps) cmd_status ;;
    logs) cmd_logs ;;
    backup) cmd_backup "${1:-manual}" ;;
    restore) cmd_restore "${1:-}" ;;
    restart) cmd_restart ;;
    down|stop) cmd_down ;;
    uninstall|remove) cmd_uninstall ;;
    doctor|check) cmd_doctor ;;
    version|-v|--version) cmd_version ;;
    help|-h|--help) cmd_help ;;
    menu) cmd_menu ;;
    "")
      if [ -t 0 ] && [ -r /dev/tty ]; then cmd_menu; else cmd_help; fi
      ;;
    *) warn "未知命令：$cmd"; cmd_help; exit 1 ;;
  esac
}

main "$@"