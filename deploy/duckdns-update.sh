#!/usr/bin/env bash
# Optional: keep a DuckDNS record pointed at this host.
# Usage: DUCKDNS_DOMAIN=myskylight DUCKDNS_TOKEN=... ./duckdns-update.sh
set -euo pipefail

: "${DUCKDNS_DOMAIN:?Set DUCKDNS_DOMAIN (the subdomain only, without .duckdns.org)}"
: "${DUCKDNS_TOKEN:?Set DUCKDNS_TOKEN}"

curl -fsS "https://www.duckdns.org/update?domains=${DUCKDNS_DOMAIN}&token=${DUCKDNS_TOKEN}&ip="
echo
