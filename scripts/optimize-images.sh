#!/usr/bin/env bash
# Regenera os WebP servidos pelo app a partir dos PNG originais (fonte de
# verdade mantida no repositório). Requer cwebp (brew install webp).
# q85: SSIM ≥ 0,97 na auditoria visual de 21/07/2026; ver AUDITORIA-PENDENCIAS.md.
set -euo pipefail
cd "$(dirname "$0")/.."

sources=(
  assets/council-chamber.png
  assets/council-chamber-light.png
  assets/characters/duque.png
  assets/characters/assassina.png
  assets/characters/capitao.png
  assets/characters/embaixadora.png
  assets/characters/condessa.png
  assets/actions/income.png
  assets/actions/foreign-aid.png
  assets/actions/tax.png
  assets/actions/steal.png
  assets/actions/exchange.png
  assets/actions/assassinate.png
  assets/actions/coup.png
)

for src in "${sources[@]}"; do
  out="${src%.png}.webp"
  cwebp -quiet -q 85 -m 6 "$src" -o "$out"
  printf '%s → %s (%s KB)\n' "$src" "$out" "$(($(stat -f%z "$out") / 1024))"
done
