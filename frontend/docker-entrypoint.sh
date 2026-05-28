#!/bin/sh
set -e

# Write runtime env vars so the browser can read window._env_
mkdir -p /app/public
cat > /app/public/env-config.js <<EOF
window._env_ = Object.freeze({
  "BE_BASE_URL": "${BE_BASE_URL:-}",
});
EOF

exec node server.js
