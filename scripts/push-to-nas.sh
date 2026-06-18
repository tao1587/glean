#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
push-to-nas.sh — build + push Glean images to a local NAS Docker registry

Usage:
  ./scripts/push-to-nas.sh [--help|-h]

Environment variables:
  REGISTRY         Registry host (default: 192.168.31.19:5000)
  TAG              Image tag         (default: latest)
  PLATFORM         Target platform   (default: linux/amd64)
  SERVICES         Space-separated subset of: backend worker web admin
                   (default: "backend worker web admin")
  NAS_SSH          If set (e.g. user@nas), SSH in after push and redeploy
  NAS_COMPOSE_DIR  Required when NAS_SSH is set — dir containing compose files

Examples:
  # Push all 4 with tag latest
  ./scripts/push-to-nas.sh

  # Push only web and admin
  SERVICES="web admin" ./scripts/push-to-nas.sh

  # Push + trigger NAS redeploy
  NAS_SSH=ming@nas NAS_COMPOSE_DIR=/volume1/docker/glean ./scripts/push-to-nas.sh

  # Tag a release
  TAG=v0.4.0 ./scripts/push-to-nas.sh
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

cd "$(dirname "$0")/.."

REGISTRY="${REGISTRY:-192.168.31.19:5000}"
TAG="${TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"
SERVICES="${SERVICES:-backend worker web admin}"
NAS_SSH="${NAS_SSH:-}"
NAS_COMPOSE_DIR="${NAS_COMPOSE_DIR:-}"

if [[ -n "$NAS_SSH" && -z "$NAS_COMPOSE_DIR" ]]; then
  echo "ERROR: NAS_SSH is set but NAS_COMPOSE_DIR is empty." >&2
  echo "       Set NAS_COMPOSE_DIR to the compose dir on the NAS (e.g. /volume1/docker/glean)." >&2
  exit 1
fi

GREEN="$(printf '\033[1;32m')"
RESET="$(printf '\033[0m')"
say() { printf '%s==>%s %s\n' "$GREEN" "$RESET" "$*"; }

dockerfile_for() {
  case "$1" in
    backend) echo "backend/Dockerfile" ;;
    worker)  echo "backend/Dockerfile.worker" ;;
    web)     echo "frontend/apps/web/Dockerfile" ;;
    admin)   echo "frontend/apps/admin/Dockerfile" ;;
    *) echo "unknown service: $1" >&2; return 1 ;;
  esac
}

context_for() {
  case "$1" in
    backend|worker) echo "backend" ;;
    web|admin)      echo "frontend" ;;
    *) echo "unknown service: $1" >&2; return 1 ;;
  esac
}

say "Glean push-to-nas"
echo "    registry : $REGISTRY"
echo "    tag      : $TAG"
echo "    platform : $PLATFORM"
echo "    services : $SERVICES"
if [[ -n "$NAS_SSH" ]]; then
  echo "    nas ssh  : $NAS_SSH"
  echo "    nas dir  : $NAS_COMPOSE_DIR"
fi
echo

pushed_refs=()

for svc in $SERVICES; do
  dockerfile="$(dockerfile_for "$svc")"
  context="$(context_for "$svc")"
  ref="$REGISTRY/glean-$svc:$TAG"

  say "build + push $svc -> $ref"
  # buildx --push produces the target-arch manifest directly; plain `docker build`
  # would bake in the host arch (arm64 on Apple Silicon) and break amd64 NAS pulls.
  docker buildx build \
    --platform "$PLATFORM" \
    --push \
    -f "$dockerfile" \
    -t "$ref" \
    "$context"

  say "verify $ref"
  curl -fsSL "http://$REGISTRY/v2/glean-$svc/manifests/$TAG" -H "Accept: application/vnd.oci.image.index.v1+json" -o /dev/null

  pushed_refs+=("$ref")
  echo
done

if [[ -n "$NAS_SSH" ]]; then
  compose_services=""
  for svc in $SERVICES; do
    compose_services="$compose_services $svc"
  done
  compose_services="${compose_services# }"

  say "redeploy on NAS ($NAS_SSH)"
  ssh "$NAS_SSH" "cd $NAS_COMPOSE_DIR && docker compose pull $compose_services && docker compose up -d $compose_services"
  echo
fi

say "done. pushed:"
for ref in "${pushed_refs[@]}"; do
  echo "    $ref"
done
