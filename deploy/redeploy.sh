#!/usr/bin/env bash
# Ship the working tree of modu-nest + modu-next to the VPS and rebuild the stack.
# Run from Git Bash:  bash modu-nest/deploy/redeploy.sh [--with-uploads]
# The deploy files live in modu-nest/deploy but land in $REMOTE/deploy on the VPS,
# beside modu-nest/ and modu-next/, which is the build context the compose file expects.
set -euo pipefail
cd "$(dirname "$0")/../.."
HOST=raspiNim@187.53.134.187
SUDO_PW=raspiNim
REMOTE=/home/muhammad/apps/modu
TAR=/tmp/modu-src.tgz

echo "== packing source"
tar --exclude=node_modules --exclude=.next --exclude=dist --exclude=.git --exclude='*.tsbuildinfo' \
    --exclude='modu-nest/uploads' --exclude='modu-nest/.env' --exclude='modu-next/.env*' \
    --exclude='modu-nest/deploy/redeploy.sh' --transform 's#^modu-nest/deploy#deploy#' \
    -czf "$TAR" modu-nest modu-next
scp -q "$TAR" "$HOST:/tmp/modu-src.tgz"

if [[ "${1:-}" == "--with-uploads" ]]; then
    echo "== shipping uploads"
    tar -czf /tmp/modu-uploads.tgz -C modu-nest uploads
    scp -q /tmp/modu-uploads.tgz "$HOST:/tmp/modu-uploads.tgz"
fi

echo "== installing and rebuilding on the VPS"
ssh "$HOST" "echo $SUDO_PW | sudo -S -p '' -u muhammad -H bash -c '
    set -e
    mkdir -p $REMOTE && cd $REMOTE
    rm -rf modu-nest modu-next && tar -xzf /tmp/modu-src.tgz
    if [ -f /tmp/modu-uploads.tgz ]; then tar -xzf /tmp/modu-uploads.tgz; fi
    mkdir -p uploads/member uploads/product uploads/article
    cd deploy && docker compose up -d --build 2>&1 | tail -15
'; echo $SUDO_PW | sudo -S -p '' rm -f /tmp/modu-src.tgz /tmp/modu-uploads.tgz"

echo "== smoke test"
set +e # report every check instead of stopping at the first one still warming up
SITE=http://187.53.134.187:8090
PRODUCTS_QUERY='{"query":"{getProducts(input:{page:1,limit:1,search:{}}){list{productImages}}}"}'
# the web and api containers restart independently — wait until both answer
for i in $(seq 1 40); do
    IMG=$(curl -s -m 5 -X POST -H 'content-type: application/json' --data "$PRODUCTS_QUERY" "$SITE/graphql" | grep -o 'uploads/[^"]*' | head -1)
    [ -n "$IMG" ] && [ "$(curl -s -m 5 -o /dev/null -w '%{http_code}' "$SITE/")" = "200" ] && break
    sleep 3
done
for path in / /product "/$IMG"; do
    printf '%-28s ' "$path"; curl -s -o /dev/null -w '%{http_code}\n' "http://187.53.134.187:8090$path"
done
curl -s -X POST -H 'content-type: application/json' --data '{"query":"{getRecommendations(limit:1){personalized}}"}' http://187.53.134.187:8090/graphql; echo
