#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# tools/optimize-assets.sh — glTF asset optimization
#
# Runs gltf-transform optimize over:
#   public/assets/vi3w/**/*.glb       (static props — aggressive compression)
#   public/assets/characters/*.glb    (rigged avatars — rig-safe compression)
#
# Usage:
#   ./tools/optimize-assets.sh               # optimize all assets in-place
#   ./tools/optimize-assets.sh --dry-run     # report sizes without modifying files
#   ./tools/optimize-assets.sh --props-only  # only process vi3w props
#   ./tools/optimize-assets.sh --chars-only  # only process character avatars
#
# Requirements:
#   npm install (gltf-transform is listed as a devDependency)
#   — or —  npm install -g @gltf-transform/cli
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Locate gltf-transform ────────────────────────────────────────────────────
GTRANSFORM=""
if command -v gltf-transform &>/dev/null; then
  GTRANSFORM="gltf-transform"
elif npx --no @gltf-transform/cli --version &>/dev/null 2>&1; then
  GTRANSFORM="npx @gltf-transform/cli"
else
  echo "ERROR: gltf-transform not found."
  echo "  Install locally:  npm install --save-dev @gltf-transform/cli"
  echo "  Install globally: npm install -g @gltf-transform/cli"
  exit 1
fi

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROPS_DIR="$ROOT/public/assets/vi3w"
CHARS_DIR="$ROOT/public/assets/characters"

# ── Flags ────────────────────────────────────────────────────────────────────
DRY_RUN=0
PROPS_ONLY=0
CHARS_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run)     DRY_RUN=1 ;;
    --props-only)  PROPS_ONLY=1 ;;
    --chars-only)  CHARS_ONLY=1 ;;
    -h|--help)
      head -20 "$0" | grep '^#' | sed 's/^# \?//'
      exit 0 ;;
    *)
      echo "Unknown flag: $arg  (run with --help)"
      exit 1 ;;
  esac
done

# ── Helpers ──────────────────────────────────────────────────────────────────
file_size() {
  # Works on macOS (BSD stat) and Linux (GNU stat).
  stat -f%z "$1" 2>/dev/null || stat -c%s "$1"
}

human() {
  # Convert bytes to a human-readable string.
  local b=$1
  if   (( b >= 1048576 )); then printf "%.1f MB" "$(echo "scale=1; $b/1048576" | bc)"
  elif (( b >= 1024 ));    then printf "%.1f KB" "$(echo "scale=1; $b/1024"    | bc)"
  else printf "%d B" "$b"; fi
}

# Accumulate totals.
TOTAL_BEFORE=0
TOTAL_AFTER=0
COUNT_OK=0
COUNT_SKIP=0
COUNT_ERR=0

# ── Core optimizer ───────────────────────────────────────────────────────────
#
# optimize_file <path> <mode>
#   mode = "prop"   — static mesh; draco compression, flatten/join allowed
#   mode = "avatar" — rigged mesh; meshopt compression, no flatten/join
#
optimize_file() {
  local input="$1"
  local mode="$2"
  local filename
  filename="$(basename "$input")"
  local size_before
  size_before=$(file_size "$input")

  # Build gltf-transform arguments based on asset type.
  local extra_flags=()
  if [[ "$mode" == "avatar" ]]; then
    # meshopt compresses geometry + animation keyframes.
    # Disable flatten/join — they break skinned mesh hierarchies.
    # Disable simplify — polygon reduction can corrupt skinning weights.
    extra_flags=(
      --compress meshopt
      --flatten false
      --join false
      --simplify false
      --texture-compress webp
    )
  else
    # Static props: draco gives better geometry compression.
    # Flatten + join reduce draw calls; simplify reduces polygon count.
    # Keep simplify-ratio at 0 (default) = auto/conservative reduction.
    extra_flags=(
      --compress draco
      --texture-compress webp
    )
  fi

  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf "  [dry-run] %-40s  %s\n" "$filename" "$(human "$size_before")"
    (( COUNT_SKIP++ )) || true
    return
  fi

  local tmp="${input%.glb}.__opt.glb"

  # Run optimizer; capture output; fail gracefully.
  local err_out
  if err_out=$(
    $GTRANSFORM optimize "$input" "$tmp" "${extra_flags[@]}" 2>&1
  ); then
    local size_after
    size_after=$(file_size "$tmp")

    if (( size_after > 0 )); then
      mv "$tmp" "$input"
      local saved=$(( size_before - size_after ))
      local pct=0
      if (( size_before > 0 )); then
        pct=$(( saved * 100 / size_before ))
      fi

      TOTAL_BEFORE=$(( TOTAL_BEFORE + size_before ))
      TOTAL_AFTER=$(( TOTAL_AFTER + size_after ))
      (( COUNT_OK++ )) || true

      if (( saved >= 0 )); then
        printf "  %-40s  %s → %s  (-%d%%)\n" \
          "$filename" "$(human "$size_before")" "$(human "$size_after")" "$pct"
      else
        # Optimizer made it larger — keep original.
        cp "$input" "$tmp"  # tmp is now the optimized (larger) version
        printf "  %-40s  %s → %s  (no gain, kept original)\n" \
          "$filename" "$(human "$size_before")" "$(human "$size_after")"
        # Revert totals to original size.
        TOTAL_AFTER=$(( TOTAL_AFTER - size_after + size_before ))
      fi
    else
      rm -f "$tmp"
      printf "  %-40s  ERROR: empty output\n" "$filename"
      (( COUNT_ERR++ )) || true
    fi
  else
    rm -f "$tmp"
    printf "  %-40s  ERROR: %s\n" "$filename" "$(echo "$err_out" | tail -1)"
    (( COUNT_ERR++ )) || true
  fi
}

# ── Process a directory ───────────────────────────────────────────────────────
process_dir() {
  local dir="$1"
  local mode="$2"
  local label="$3"

  if [[ ! -d "$dir" ]]; then
    echo "  (directory not found — skipping)"
    (( COUNT_SKIP++ )) || true
    return
  fi

  local files=()
  while IFS= read -r -d '' f; do
    files+=("$f")
  done < <(find "$dir" -name "*.glb" -print0 | sort -z)

  if [[ ${#files[@]} -eq 0 ]]; then
    echo "  (no .glb files found — place assets first)"
    (( COUNT_SKIP++ )) || true
    return
  fi

  echo "  Found ${#files[@]} file(s) in $dir"
  for f in "${files[@]}"; do
    optimize_file "$f" "$mode"
  done
}

# ── Main ─────────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  glTF Asset Optimizer"
[[ "$DRY_RUN" -eq 1 ]] && echo "  MODE: dry-run (no files modified)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [[ "$CHARS_ONLY" -eq 0 ]]; then
  echo ""
  echo "▸ Vi3W props  (draco compression, full pipeline)"
  process_dir "$PROPS_DIR" "prop" "props"
fi

if [[ "$PROPS_ONLY" -eq 0 ]]; then
  echo ""
  echo "▸ Character avatars  (meshopt compression, rig-safe)"
  process_dir "$CHARS_DIR" "avatar" "avatars"
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "  Dry run complete — no files modified"
else
  if (( TOTAL_BEFORE > 0 )); then
    local_saved=$(( TOTAL_BEFORE - TOTAL_AFTER ))
    local_pct=$(( local_saved * 100 / TOTAL_BEFORE ))
    echo "  Optimized : $COUNT_OK file(s)"
    echo "  Total     : $(human "$TOTAL_BEFORE") → $(human "$TOTAL_AFTER")  (-${local_pct}%  saved $(human "$local_saved"))"
  else
    echo "  Optimized : $COUNT_OK file(s)"
  fi
  [[ "$COUNT_ERR"  -gt 0 ]] && echo "  Errors    : $COUNT_ERR file(s)"
  [[ "$COUNT_SKIP" -gt 0 ]] && echo "  Skipped   : $COUNT_SKIP"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

[[ "$COUNT_ERR" -gt 0 ]] && exit 1 || exit 0
