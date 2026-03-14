#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "usage: $0 <owner> <repo> <number> [source-root]" >&2
  exit 1
fi

owner="$1"
repo="$2"
number="$3"
source_root="${4:-$HOME/.lgtmate/analyses}"
target_root="src/demo/analyses"

source_path="$source_root/$owner/$repo/$number/analysis.json"
target_path="$target_root/$owner/$repo/$number/analysis.json"

if [ ! -f "$source_path" ]; then
  echo "analysis cache not found: $source_path" >&2
  exit 1
fi

mkdir -p "$(dirname "$target_path")"
cp "$source_path" "$target_path"

echo "imported $source_path -> $target_path"
