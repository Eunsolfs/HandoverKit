#!/bin/sh
set -eu

# 旧版本镜像的 /data 卷可能属于 nobody(65534)，新镜像使用 app(100)。
# 以 root 启动时先修正卷权限，再降权运行；已有数据不会被删除。
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data
  chown -R app:app /data
  exec su-exec app "$@"
fi

exec "$@"
