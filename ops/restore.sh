#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required (install PostgreSQL client tools)" >&2; exit 69; }
backup="${1:-}"
if [[ -z "$backup" || ! -f "$backup" ]]; then
  echo "Usage: $0 /path/to/backup.dump" >&2
  exit 64
fi

if [[ "${CONFIRM_RESTORE:-}" != "RESTORE" ]]; then
  echo "Refusing restore. Set CONFIRM_RESTORE=RESTORE explicitly." >&2
  exit 65
fi

pg_restore --list "$backup" >/dev/null
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$DATABASE_URL" "$backup"
echo "Restore completed from: $backup"
