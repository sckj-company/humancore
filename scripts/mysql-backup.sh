#!/usr/bin/env bash
# Dump persistente da base hrms (fora de /tmp) para sobreviver a reboots.
#
# O datadir do MySQL vive em /tmp/hrms-mysql e e apagado em cada reboot;
# este script mantem uma copia comprimida em $PROJECT_DIR/backups/ e o
# scripts/mysql-up.sh restaura-a automaticamente quando o datadir renasce.
#
# Uso:  scripts/mysql-backup.sh             # cria/actualiza latest.sql.gz
#       scripts/mysql-backup.sh --restore   # restaura o latest (mysqld a correr)
set -euo pipefail

BASE=/tmp/hrms-mysql
SOCKET="$BASE/run/mysqld.sock"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_DIR/backups"
KEEP=48   # ~24h com corridas de 30 min

mkdir -p "$BACKUP_DIR"

if [ "${1:-}" = "--restore" ]; then
  DUMP="$BACKUP_DIR/latest.sql.gz"
  [ -f "$DUMP" ] || { echo ">> [ERRO] sem dump em $DUMP"; exit 1; }
  gunzip -t "$DUMP"
  mysql --socket="$SOCKET" -uroot < <(gunzip -c "$DUMP")
  echo ">> Restaurado $DUMP ($(date '+%F %T'))"
  exit 0
fi

command -v mysqldump >/dev/null 2>&1 || { echo ">> [ERRO] mysqldump nao encontrado"; exit 1; }
[ -S "$SOCKET" ] || { echo ">> [ERRO] mysqld (3307) nao esta a correr"; exit 1; }
mysqladmin --socket="$SOCKET" -uroot ping >/dev/null 2>&1 || { echo ">> [ERRO] mysqld nao responde"; exit 1; }

STAMP=$(date +%Y%m%d-%H%M%S)
TMP="$BACKUP_DIR/.tmp-$STAMP.sql.gz"

mysqldump --socket="$SOCKET" -uroot --single-transaction --routines --triggers \
  --events --databases hrms | gzip -9 > "$TMP"
gunzip -t "$TMP"

# latest atomico (cp+mv para nao deixar um latest a meio)
cp "$TMP" "$BACKUP_DIR/.latest.sql.gz.tmp"
mv "$BACKUP_DIR/.latest.sql.gz.tmp" "$BACKUP_DIR/latest.sql.gz"
mv "$TMP" "$BACKUP_DIR/hrms-$STAMP.sql.gz"

# retencao
ls -1t "$BACKUP_DIR"/hrms-*.sql.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo ">> dump ok: backups/hrms-$STAMP.sql.gz ($(du -h "$BACKUP_DIR/latest.sql.gz" | cut -f1)) @ $(date '+%F %T')"
