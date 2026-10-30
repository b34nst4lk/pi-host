#!/bin/sh
# Build the wall's static bundle: `assets/` = index.html + assets/js/**.
#
# The JS tree is copied whole (not bundled): Gleam's output uses relative imports
# between `wall/` and its dependencies, so the directory layout is the bundle.
# Nothing here is minified on purpose — the wall has no build tooling beyond the
# Gleam compiler, and "built things live in the repo" is the house rule.
set -eu
cd "$(dirname "$0")"

: "${GLEAM:=gleam}"
"$GLEAM" build --target javascript

rm -rf assets
mkdir -p assets/js
cp -R build/dev/javascript/. assets/js/
rm -rf assets/js/wall/internal assets/js/gleeunit
# compile caches are build machinery, not runtime: they mutate every rebuild
# and would flap in git forever (found in review 2026-10-30)
find assets -name "_gleam_artefacts" -type d -exec rm -rf {} + 2>/dev/null || true
find assets -name "*.cache" -o -name "*.cache_meta" | xargs rm -f
cp index.html assets/index.html

echo "assets/index.html"
find assets -name '*.mjs' | wc -l | tr -d ' ' | xargs -I{} echo "{} js files"
du -sh assets | cut -f1 | xargs -I{} echo "{} total"
