#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
command -v pg_dump >/dev/null 2>&1 || { echo "pg_dump is required (install PostgreSQL client tools)" >&2; exit 69; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required (install PostgreSQL client tools)" >&2; exit 69; }
BACKUP_DIR="${BACKUP_DIR:-./var/backups}"
mkdir -p "$BACKUP_DIR"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/dapuremakita-$timestamp.dump"

pg_dump --format=custom --no-owner --no-privileges --file="$target" "$DATABASE_URL"
pg_restore --list "$target" >/dev/null

echo "Backup created and verified: $target"
