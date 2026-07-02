#!/usr/bin/env bash
# Deploy the AR Art Gallery (frontend + gallery-api) to the VPS.
#
#   ./deploy/deploy.sh                       # default host
#   ./deploy/deploy.sh user@other-host      # override
#
# Layout created on the VPS under /home/deploy/ar-art/:
#   site/               static frontend (bind-mounted read-only into nginx)
#   api/                gallery-api code (bind-mounted read-only into node)
#   nginx.conf          web container config
#   docker-compose.yml  both containers
#
# Static file changes are live immediately (bind mount). API code changes need
# the container restart this script performs. Artwork data lives in the
# api-data volume and is untouched by deploys.
set -euo pipefail
cd "$(dirname "$0")/.."

HOST="${1:-deploy@75.119.159.194}"
DEST=/home/deploy/ar-art

echo "==> frontend -> $HOST:$DEST/site/"
rsync -az --delete \
  --exclude '.git' --exclude '.github' --exclude '.nojekyll' \
  --exclude node_modules --exclude services --exclude deploy \
  --exclude tests --exclude contracts --exclude '*.log' \
  ./ "$HOST:$DEST/site/"

echo "==> gallery-api -> $HOST:$DEST/api/"
rsync -az --delete --exclude data --exclude node_modules \
  services/gallery-api/ "$HOST:$DEST/api/"

echo "==> infra -> $HOST:$DEST/"
rsync -az deploy/docker-compose.yml deploy/nginx.conf "$HOST:$DEST/"

echo "==> (re)start containers"
ssh "$HOST" "cd $DEST \
  && docker compose up -d \
  && docker compose restart api \
  && docker exec ar-art_web nginx -t \
  && docker exec ar-art_web nginx -s reload"

echo "==> smoke check"
ssh "$HOST" "docker exec ar-art_web wget -qO- http://api:8787/api/health && echo && docker exec ar-art_web wget -q --spider http://127.0.0.1:80/ && echo 'web: ok'"

echo "Done. Hard-refresh the site (Ctrl+Shift+R) — html/js are no-cache now."
