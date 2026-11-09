#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

on_error() {
    local exit_code=$?
    trap - ERR
    echo "Deploy falhou (código $exit_code). A aplicação pode permanecer em modo de manutenção." >&2
    echo "Verifique o erro acima antes de voltar a disponibilizar os serviços." >&2
    exit "$exit_code"
}
trap on_error ERR

if [[ ! -f .env ]]; then
    echo "Ficheiro .env não encontrado na raiz do projeto." >&2
    exit 1
fi

docker compose version >/dev/null

echo ">> A construir as imagens de produção..."
docker compose build app worker frontend

echo ">> A garantir que a base de dados e o Redis estão disponíveis..."
docker compose up -d db redis

if docker compose ps --status running --services app | grep -qx app; then
    echo ">> A ativar o modo de manutenção..."
    docker compose exec -T app php artisan down --retry=60
else
    echo ">> A ativar o modo de manutenção..."
    docker compose run --rm app php artisan down --retry=60
fi

echo ">> A parar a API e o worker durante a atualização do schema..."
docker compose stop worker app

echo ">> A aplicar todas as migrações pendentes..."
docker compose run --rm app php artisan migrate --force

echo ">> A iniciar a API e o frontend atualizados..."
docker compose up -d app frontend

echo ">> A reabrir a aplicação..."
docker compose exec -T app php artisan up

echo ">> A iniciar o worker e o proxy..."
docker compose up -d worker caddy

echo ">> Estado dos serviços:"
docker compose ps
