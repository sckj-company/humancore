#!/usr/bin/env bash
# Sobe a instancia MySQL dedicada do projeto (porto 3307).
#
# O mysqld do sistema corre sob AppArmor que so permite datadir em /tmp
# ou /var/lib/mysql; sem sudo nao conseguimos usar um datadir persistente.
# Assim, o datadir vive em /tmp/hrms-mysql e desaparece a cada reboot.
# Se o datadir nao existir, este script reinicializa e restaura o dump
# persistente de backups/latest.sql.gz (ver scripts/mysql-backup.sh).
#
# Uso:  scripts/mysql-up.sh            # sobe e garante utilizador/base
#       scripts/mysql-up.sh --seed     # alem disso, migrate:fresh --seed
set -euo pipefail

BASE=/tmp/hrms-mysql
DATADIR="$BASE/data"
RUNDIR="$BASE/run"
MYCNF="$BASE/my.cnf"
SOCKET="$RUNDIR/mysqld.sock"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MYSQLD="$(command -v mysqld || echo /usr/sbin/mysqld)"

mkdir -p "$DATADIR" "$RUNDIR"
chmod 750 "$DATADIR"

if [ "$(ls -A "$DATADIR" 2>/dev/null | wc -l)" -eq 0 ]; then
  echo ">> [AVISO] datadir em $DATADIR nao existe (reboot?). A inicializar de novo..."
  "$MYSQLD" --no-defaults --initialize-insecure --datadir="$DATADIR" --user="$USER"
  NEEDS_SEED=1
else
  NEEDS_SEED=0
fi

cat > "$MYCNF" <<EOF
[mysqld]
user=$USER
port=3307
bind-address=127.0.0.1
datadir=$DATADIR
socket=$SOCKET
pid-file=$RUNDIR/mysqld.pid
mysqlx=0
character-set-server=utf8mb4
collation-server=utf8mb4_unicode_ci
skip-log-bin
EOF

if [ -S "$SOCKET" ] && mysqladmin --socket="$SOCKET" -uroot ping >/dev/null 2>&1; then
  echo ">> MySQL 3307 ja esta a correr."
else
  echo ">> A iniciar mysqld (3307)..."
  "$MYSQLD" --defaults-file="$MYCNF" >"$RUNDIR/start.log" 2>&1 &
  for i in $(seq 1 30); do
    if [ -S "$SOCKET" ] && mysqladmin --socket="$SOCKET" -uroot ping >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

mysql --socket="$SOCKET" -uroot <<'SQL'
CREATE DATABASE IF NOT EXISTS hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'hrms'@'localhost' IDENTIFIED BY 'hrms_secret_2026';
CREATE USER IF NOT EXISTS 'hrms'@'127.0.0.1' IDENTIFIED BY 'hrms_secret_2026';
GRANT ALL PRIVILEGES ON hrms.* TO 'hrms'@'localhost';
GRANT ALL PRIVILEGES ON hrms.* TO 'hrms'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

DUMP="$PROJECT_DIR/backups/latest.sql.gz"

if [ "$NEEDS_SEED" -eq 1 ]; then
  if [ -f "$DUMP" ] && gunzip -t "$DUMP" 2>/dev/null; then
    echo ">> [AVISO] datadir vazio -> a restaurar dump persistente ($DUMP)..."
    mysql --socket="$SOCKET" -uroot < <(gunzip -c "$DUMP")
    echo ">> Restauracao concluida (base: hrms)."
  elif [ "${1:-}" = "--seed" ]; then
    echo ">> Sem dump valido -> a repopular de raiz (migrate:fresh --seed)..."
    (cd "$PROJECT_DIR/backend" && php artisan migrate:fresh --seed --force && php artisan db:seed --class=DemoSeeder --force)
  else
    echo ">> [AVISO] datadir vazio e SEM dump em $DUMP."
    echo ">>   Corre 'scripts/mysql-up.sh --seed' para recriar de raiz, ou"
    echo ">>   restauro manual: 'scripts/mysql-backup.sh --restore'."
  fi
fi

# Sempre executa migracoes pendentes ao iniciar/reiniciar
echo ">> A executar migracoes pendentes..."
(cd "$PROJECT_DIR/backend" && DB_SOCKET="$SOCKET" php artisan migrate --force)

echo ">> Pronto. MySQL 3307 OK (base: hrms, user: hrms, socket: $SOCKET)"