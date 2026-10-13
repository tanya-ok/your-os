#!/usr/bin/env bash
set -euo pipefail
DOCS_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS_VENV="$DOCS_ROOT/private/docs-venv"
cd "$DOCS_ROOT"
case "${1:-serve}" in
  --setup)
    mkdir -p "$DOCS_ROOT/private"
    if command -v uv >/dev/null 2>&1; then
      uv venv "$DOCS_VENV"
      uv pip install --python "$DOCS_VENV/bin/python" -r "$DOCS_ROOT/requirements-docs.txt"
    else
      python3 -c 'import sys; assert sys.version_info >= (3, 11), "Documentation requires Python 3.11 or newer"'
      python3 -m venv "$DOCS_VENV"
      "$DOCS_VENV/bin/python" -m pip install -r "$DOCS_ROOT/requirements-docs.txt"
    fi
    printf '%s\n' 'Documentation environment ready. Run: bash scripts/docs.sh serve'
    ;;
  serve)
    if [[ ! -x "$DOCS_VENV/bin/zensical" ]]; then
      printf '%s\n' 'Documentation is not installed. Run bash scripts/docs.sh --setup explicitly.' >&2
      exit 1
    fi
    exec "$DOCS_VENV/bin/zensical" serve --config-file "$DOCS_ROOT/zensical.toml" --dev-addr 127.0.0.1:3106
    ;;
  build)
    if [[ ! -x "$DOCS_VENV/bin/zensical" ]]; then
      printf '%s\n' 'Documentation is not installed. Run bash scripts/docs.sh --setup explicitly.' >&2
      exit 1
    fi
    exec "$DOCS_VENV/bin/zensical" build --config-file "$DOCS_ROOT/zensical.toml" --strict
    ;;
  *)
    printf '%s\n' 'Usage: bash scripts/docs.sh [--setup|serve|build]' >&2
    exit 2
    ;;
esac
