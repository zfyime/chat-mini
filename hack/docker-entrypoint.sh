#!/bin/sh
set -e

# 先做环境变量注入（替换 dist/**/*.mjs 中的占位符）
/bin/sh ./docker-env-replace.sh

# 用 exec 把 node 提升为 PID 1，docker stop 能直接收到 SIGTERM
exec node dist/server/entry.mjs
