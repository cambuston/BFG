#!/usr/bin/env bash
set -euo pipefail

# Script seguro para subir secretos a GitHub desde ../DiasQueCuentan
# Revisión manual recomendada antes de ejecutar.

DQC="../DiasQueCuentan"
ENVFILE="$DQC/.env"

echo "Repo root: $(pwd)"
echo "Looking for DiasQueCuentan at: $DQC"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install and authenticate: gh auth login"
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh not authenticated. Run: gh auth login"
  exit 1
fi

set_from_file() {
  local file="$1" secret="$2"
  if [ -f "$file" ]; then
    echo "Setting secret $secret from file $file"
    # encode without line breaks
    VAL=$(openssl base64 -A < "$file")
    gh secret set "$secret" --body "$VAL"
    echo " -> $secret set"
  else
    echo "Skipping $secret: file not found ($file)"
  fi
}

set_from_env() {
  local var="$1" secret="$2"
  if [ -f "$ENVFILE" ]; then
    VAL=$(grep -m1 -E "^${var}=" "$ENVFILE" 2>/dev/null || true)
    if [ -n "$VAL" ]; then
      # strip KEY= and surrounding quotes
      VAL=${VAL#${var}=}
      VAL=$(echo "$VAL" | sed -E 's/^"(.*)"$/\1/' | sed -E "s/^'(.*)'$/\1/")
      if [ -n "$VAL" ]; then
        echo "Setting secret $secret from $ENVFILE variable $var"
        gh secret set "$secret" --body "$VAL"
        echo " -> $secret set"
        return 0
      fi
    fi
  fi
  echo "Skipping $secret: variable $var not found in $ENVFILE"
  return 1
}

echo "-- Files (Play JSON, Apple .p8) --"
# Try common names for Play service account
PLAY_JSON_CANDIDATES=("$DQC/play-service-account.json" "$DQC/play-service-account.key.json" "$DQC/play-service-account*.json")
for p in "$DQC"/*play* "$DQC"/*service* "$DQC"/*.json; do
  if [ -f "$p" ]; then
    echo "Found possible JSON: $p"
  fi
done

# Set JSON_KEY_FILE if a JSON exists at an expected path
if [ -f "$DQC/play-service-account.json" ]; then
  set_from_file "$DQC/play-service-account.json" JSON_KEY_FILE
else
  echo "No play-service-account.json found at $DQC/play-service-account.json (skipping)"
fi

# Find AuthKey_*.p8
P8=$(ls "$DQC"/AuthKey_*.p8 2>/dev/null | head -n1 || true)
if [ -n "$P8" ]; then
  set_from_file "$P8" APPLE_PRIVATE_KEY
else
  echo "No AuthKey_*.p8 found in $DQC (skipping APPLE_PRIVATE_KEY)"
fi

echo "-- Variables from .env (if present) --"
VARS=(APPLE_KEY_ID APPLE_TEAM_ID APPLE_CLIENT_ID_FLECOS APPLE_CLIENT_ID_BARBAS APPLE_CLIENT_ID_GARRAS
      GOOGLE_CLIENT_ID_FLECOS GOOGLE_CLIENT_SECRET_FLECOS
      GOOGLE_CLIENT_ID_BARBAS GOOGLE_CLIENT_SECRET_BARBAS
      GOOGLE_CLIENT_ID_GARRAS GOOGLE_CLIENT_SECRET_GARRAS)

for v in "${VARS[@]}"; do
  set_from_env "$v" "$v"
done

# FYB secret: create if not present
echo "Setting FYB_SECRET (random)"
gh secret set FYB_SECRET --body "$(openssl rand -hex 32)" && echo " -> FYB_SECRET set"

echo "Done. Review GitHub repository secrets in Settings → Secrets → Actions."

echo "If any secret was skipped, run the relevant gh command manually or adjust paths in this script."
