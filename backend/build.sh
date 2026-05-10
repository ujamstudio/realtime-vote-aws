#!/usr/bin/env bash
# Bundles each Lambda into dist/<name>.zip with shared/ + redis dependency.
# boto3 ships with the Lambda runtime, so we only vendor `redis`.
set -euo pipefail

cd "$(dirname "$0")"

DIST="dist"
rm -rf "$DIST"
mkdir -p "$DIST"

VENDOR="$DIST/_vendor"
mkdir -p "$VENDOR"
python3 -m pip install --quiet --target "$VENDOR" -r requirements.txt

LAMBDAS=(worker admin_reset admin_song round_info round_state round_verify ws_connect ws_disconnect broadcaster)

for name in "${LAMBDAS[@]}"; do
    src="lambdas/$name"
    build="$DIST/build_$name"
    rm -rf "$build"
    mkdir -p "$build"

    cp -R "$VENDOR"/* "$build"/
    cp -R shared "$build"/shared
    cp "$src"/handler.py "$build/handler.py"

    (cd "$build" && zip -qr "../${name}.zip" .)
    rm -rf "$build"
    echo "built dist/${name}.zip"
done

rm -rf "$VENDOR"
echo "done."
