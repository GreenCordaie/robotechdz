#!/usr/bin/env bash
# Pack les stubs LoadBrain du repo en .tgz aux chemins attendus par package.json.
# Utilisé UNIQUEMENT en CI GitHub Actions.
#
# ⚠️ EN LOCAL CE SCRIPT REFUSE DE TOURNER (sauf override explicite via
#    LOADBRAIN_STUB_FORCE=1) car il écraserait les vrais .tgz LoadBrain
#    présents sur le poste de dev.

set -euo pipefail

if [ "${CI:-}" != "true" ] && [ "${GITHUB_ACTIONS:-}" != "true" ] && [ "${LOADBRAIN_STUB_FORCE:-}" != "1" ]; then
    echo "[ci-stubs] REFUS d'exécution — pas en CI (CI=$CI, GITHUB_ACTIONS=$GITHUB_ACTIONS)"
    echo "[ci-stubs] Pour forcer en local : LOADBRAIN_STUB_FORCE=1 bash $0"
    echo "[ci-stubs] (ATTENTION : écrasera vos vrais .tgz LoadBrain s'ils existent)"
    exit 0
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET_DIR="$(cd "$REPO_ROOT/.." && pwd)/LoadBrain/dist-packages"

echo "[ci-stubs] REPO_ROOT=$REPO_ROOT"
echo "[ci-stubs] TARGET_DIR=$TARGET_DIR"

mkdir -p "$TARGET_DIR"

pack_stub() {
    local stub_dir="$1"
    local target_name="$2"
    local tmpdir
    tmpdir="$(mktemp -d)"
    (
        cd "$stub_dir"
        npm pack --pack-destination "$tmpdir" --silent > /dev/null
    )
    local produced
    produced="$(ls "$tmpdir"/*.tgz | head -1)"
    mv "$produced" "$TARGET_DIR/$target_name"
    rm -rf "$tmpdir"
    echo "[ci-stubs] OK $target_name"
}

pack_stub "$REPO_ROOT/vendor/loadbrain-site-integration-stub" "loadbrain-site-integration-3.2.0-fixed.tgz"
pack_stub "$REPO_ROOT/vendor/loadbrain-sdk-stub" "loadbrain-sdk-3.2.0.tgz"

# @loadbrain/sdk-v2 is referenced as a DIRECTORY dep (file:../LoadBrain/packages/sdk-v2),
# not a tgz, and its dist is gitignored upstream + its tsconfig extends a workspace
# package (can't build standalone in CI). We vendor the REAL compiled output (real
# .d.ts → strict tsc passes accurately; nothing hand-written to drift) and drop it
# at the expected path. NB vendored under lib/ (not dist/ — root .gitignore excludes
# dist). To refresh: cp ../LoadBrain/packages/sdk-v2/dist/* -> vendor/loadbrain-sdk-v2/lib/
# (drop *.map) when the SDK API changes.
SDK_V2_TARGET="$(cd "$REPO_ROOT/.." && pwd)/LoadBrain/packages/sdk-v2"
mkdir -p "$SDK_V2_TARGET"
cp -r "$REPO_ROOT/vendor/loadbrain-sdk-v2/." "$SDK_V2_TARGET/"
echo "[ci-stubs] OK sdk-v2 (vendored real dist) -> $SDK_V2_TARGET"

echo "[ci-stubs] Done. Files in $TARGET_DIR :"
ls -lh "$TARGET_DIR"
