#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <major|minor|patch|x.y.z>"
  exit 1
}

[[ $# -eq 1 ]] || usage

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PKG="$ROOT/package.json"

current=$(node -p "require('$PKG').version")
IFS='.' read -r major minor patch <<< "$current"

case "$1" in
  major) new="$((major + 1)).0.0" ;;
  minor) new="${major}.$((minor + 1)).0" ;;
  patch) new="${major}.${minor}.$((patch + 1))" ;;
  [0-9]*.[0-9]*.[0-9]*) new="$1" ;;
  *) usage ;;
esac

echo "Bumping $current → $new"

bump_json() {
  local file="$1"
  node -e "
    const fs = require('fs');
    const obj = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    obj.version = process.argv[2];
    fs.writeFileSync(process.argv[1], JSON.stringify(obj, null, 2) + '\n');
  " "$file" "$new"
}

bump_json "$PKG"
bump_json "$ROOT/src/manifest.json"
bump_json "$ROOT/src/manifest.e2e.json"

# Keep package-lock.json in sync without touching node_modules
(cd "$ROOT" && npm install --package-lock-only --ignore-scripts 2>/dev/null)

echo "Done. All version fields are now at $new."
