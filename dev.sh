#!/usr/bin/env bash
# Runs the whole site locally: builds the worlds, then starts Spring Boot on http://localhost:8080
#   ./dev.sh          build once and run (what a visitor gets)
#   ./dev.sh watch    run Spring Boot plus Vite with live reload on http://localhost:5173
set -euo pipefail
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Needs Node.js 20 or newer: https://nodejs.org"; exit 1; }
command -v java >/dev/null || { echo "Needs Java 21 or newer: https://adoptium.net"; exit 1; }
export ADMIN_TOKEN="${ADMIN_TOKEN:-local}"
export SITE_DATA_DIR="${SITE_DATA_DIR:-$PWD/data}"
( cd web && [ -d node_modules ] || npm ci --no-audit --no-fund )
if [ "${1:-}" = "watch" ]; then
  ( cd web && [ -f dist/index.html ] || npm run build )
  ( cd server && ./mvnw -q -DskipTests spring-boot:run ) &
  trap 'kill 0' EXIT
  echo "Admin panel: http://localhost:5173/admin.html  (token: $ADMIN_TOKEN)"
  cd web && npx vite
else
  ( cd web && npm run build )
  echo
  echo "  Site:         http://localhost:8080"
  echo "  Admin panel:  http://localhost:8080/admin   (token: $ADMIN_TOKEN)"
  echo
  cd server && ./mvnw -q -DskipTests spring-boot:run
fi
