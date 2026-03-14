#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -lt 4 ] || [ "$#" -gt 5 ]; then
  echo "usage: $0 <owner> <repo> <number> <provider> [source-root]" >&2
  exit 1
fi

owner="$1"
repo="$2"
number="$3"
provider="$4"
source_root="${5:-$HOME/.lgtmate/analyses}"
target_root="src/demo/analyses"

source_path="$source_root/$owner/$repo/$number/$provider.json"
target_path="$target_root/$owner/$repo/$number/$provider.json"

if [ ! -f "$source_path" ]; then
  echo "analysis cache not found: $source_path" >&2
  exit 1
fi

mkdir -p "$(dirname "$target_path")"
cp "$source_path" "$target_path"

echo "imported $source_path -> $target_path"
