#!/bin/sh
set -eu

NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=/opt/glean-rsshub/install-ca-chain.mjs"
export NODE_OPTIONS
exec "$@"
