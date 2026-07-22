#!/usr/bin/env bash
# Il refresh del grafo Atlas in UN comando: genera → branch → commit → push → PR.
# Il lavoro umano che resta è il merge — ED È VOLUTO: la PR col diff del JSON è
# il punto in cui un occhio vede cosa sta per diventare pubblico (ADR 0005).
# Uso:  ./scripts/aggiorna-grafo-atlas.sh [path-di-Atlas]
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "working tree sporco: committa o stasha prima di rigenerare il grafo" >&2
  exit 1
fi

node scripts/genera-grafo-atlas.mjs "${1:-$HOME/GitHub/Atlas}"

if [ -z "$(git status --porcelain -- astro-project/src/data/atlas-graph.json)" ]; then
  echo "il grafo è già aggiornato: niente da fare"
  exit 0
fi

branch="grafo-atlas/$(date +%Y-%m-%d)"
git checkout -b "$branch"
git add astro-project/src/data/atlas-graph.json
git commit -m "content(atlas): refresh del grafo dalla wiki

Rigenerato con scripts/genera-grafo-atlas.mjs. Il diff del JSON e' il
punto di revisione privacy: guardare le etichette nuove prima di mergiare."
git push -u origin "$branch"
gh pr create --fill --body "Refresh del grafo di Atlas. **Rivedi le etichette nuove nel diff del JSON prima di mergiare**: è la guardia di privacy umana (ADR 0005). Le tre guardie automatiche girano in CI."
git checkout -
echo
echo "PR aperta. Il merge — dopo un occhio al diff — chiude il giro."
