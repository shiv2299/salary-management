#!/bin/sh
# Container entrypoint: runs the API (port $PORT, default 3001) and the Next.js server (port 3000)
# side by side. If either exits, stop the other and exit non-zero so the platform restarts the container.
set -u

node /app/apps/api/dist/server.js &
api=$!
PORT=3000 HOSTNAME=0.0.0.0 node /app/web/apps/web/server.js &
web=$!

stop() {
  kill "$api" "$web" 2>/dev/null
  wait "$api" "$web" 2>/dev/null
}
trap 'stop; exit 0' TERM INT

# Poll rather than `wait -n`, which POSIX sh lacks.
while kill -0 "$api" 2>/dev/null && kill -0 "$web" 2>/dev/null; do
  sleep 1
done

echo "a child process exited; shutting down" >&2
stop
exit 1
