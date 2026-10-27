#!/usr/bin/env bash
# Snapshot the MySkylight SQLite database and verify the copy.
set -euo pipefail

umask 077

DB_PATH="${DB_PATH:-/opt/myskylight/app/server/myskylight.db}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/myskylight}"
KEEP_DAYS="${KEEP_DAYS:-14}"

if [[ ! -f "$DB_PATH" ]]; then
  echo "database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/myskylight-$STAMP.db"

cp "$DB_PATH" "$DEST"

# sql.js writes the whole file on each mutation; verify the snapshot is a
# valid SQLite database before trusting it.
if command -v sqlite3 >/dev/null 2>&1; then
  if [[ "$(sqlite3 "$DEST" 'PRAGMA integrity_check;')" != "ok" ]]; then
    echo "backup verification failed: $DEST" >&2
    rm -f "$DEST"
    exit 1
  fi
fi

find "$BACKUP_DIR" -type f -name 'myskylight-*.db' -mtime +"$KEEP_DAYS" -delete
echo "backup written: $DEST"
