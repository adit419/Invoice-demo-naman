#!/bin/sh
# line endings must be \n, not \r\n !

mkdir -p /app/frontend/public

echo "window._env_ = Object.freeze({" > /app/frontend/public/env-config.js

while IFS= read -r line || [ -n "$line" ]; do
    if [ -n "$line" ] && [ "${line#\#}" = "$line" ]; then
        var_name=$(echo "$line" | cut -d '=' -f1)
        var_value=$(printenv "$var_name")
        if [ -n "$var_value" ]; then
            escaped_value=$(echo "$var_value" | sed 's/"/\\"/g')
            echo "  \"$var_name\": \"$escaped_value\"," >> /app/frontend/public/env-config.js
        fi
    fi
done < /app/frontend/.env.example

echo "});" >> /app/frontend/public/env-config.js
