#!/usr/bin/env bash
# Sube origin/main a producción (frijolitos.cambuston.com → /opt/flecosybarbas/app).
# La base vive fuera de app/ (/opt/flecosybarbas/data) y el .env arriba de app/,
# así que el despliegue no los toca. Respalda app/ y la base antes de copiar.
#
#   bash scripts/desplegar.sh
#
# El reinicio pide la contraseña de sudo de frijol (la unidad tiene
# Restart=on-failure, así que matar el proceso con SIGTERM no lo levanta solo).
set -euo pipefail

HOST=frijol@frijolitos.cambuston.com
cd "$(dirname "$0")/.."

git fetch -q origin
echo "Subiendo: $(git log --oneline -1 origin/main)"
TMP=$(mktemp -d)
git archive --format=tar.gz -o "$TMP/bfg.tgz" origin/main
scp -q "$TMP/bfg.tgz" "$HOST:/tmp/bfg-main.tgz"

ssh "$HOST" 'bash -s' <<'REMOTO'
set -euo pipefail
TS=$(date +%Y%m%d-%H%M%S)
B=~/flecosybarbas-backups
mkdir -p "$B"
tar czf "$B/app-$TS.tgz" -C /opt/flecosybarbas --exclude=app/node_modules app
cd /opt/flecosybarbas/app
node -e '
  const D = require("better-sqlite3");
  new D("/opt/flecosybarbas/data/flecosybarbas.db", { readonly: true })
    .backup(process.argv[1]).then(() => console.log("base respaldada"));
' "$B/db-$TS.db"
tar xzf /tmp/bfg-main.tgz -C /opt/flecosybarbas/app
rm /tmp/bfg-main.tgz
npm ci --omit=dev --no-audit --no-fund
echo "Respaldos en $B: app-$TS.tgz, db-$TS.db"
REMOTO

ssh -t "$HOST" 'sudo systemctl restart flecosybarbas && sleep 2 && systemctl is-active flecosybarbas && curl -s -o /dev/null -w "localhost:3100 → %{http_code}\n" http://localhost:3100/'
echo "Listo: https://flecos.mx"
