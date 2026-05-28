#!/bin/sh
set -e
/app/env.sh
exec supervisord -n -c /etc/supervisor/conf.d/app.conf
