#!/usr/bin/env bash
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! git -C "$PROJECT_DIR" rev-parse --git-dir >/dev/null 2>&1; then
    echo "Este script deve ser executado numa cópia de trabalho Git." >&2
    exit 1
fi

if [[ ! -f "$PROJECT_DIR/.env" ]]; then
    echo "Configure primeiro o ficheiro .env na raiz do projeto." >&2
    exit 1
fi

docker compose version >/dev/null

git -C "$PROJECT_DIR" config --local core.hooksPath "$PROJECT_DIR/.githooks"

echo "Hook pós-pull instalado nesta cópia local do repositório."
echo "A executar o primeiro deploy..."
"$PROJECT_DIR/scripts/deploy-vps.sh"
