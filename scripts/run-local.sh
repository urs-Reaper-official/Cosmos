#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="${COSMOS_PYTHON:-$HOME/.cosmos/venv/bin/python}"

if [[ ! -x "$PYTHON" ]]; then
  printf 'COSMOS Python runtime not found at %s. Install Python 3.12 and the local extra first.\n' "$PYTHON" >&2
  exit 1
fi

export COSMOS_MODEL_PATH="${COSMOS_MODEL_PATH:-$HOME/.cosmos/models/qwen2.5-0.5b-instruct-q4_k_m.gguf}"
export COSMOS_CONTEXT_SIZE="${COSMOS_CONTEXT_SIZE:-2048}"
export COSMOS_DATA_DIR="${COSMOS_DATA_DIR:-$HOME/.cosmos}"
export COSMOS_HOST="${COSMOS_HOST:-127.0.0.1}"
export COSMOS_PORT="${COSMOS_PORT:-8000}"
export PYTHONPATH="$ROOT_DIR/src${PYTHONPATH:+:$PYTHONPATH}"

if [[ -n "${CODESPACES:-}" && -z "${COSMOS_API_TOKEN:-}" ]]; then
  export COSMOS_ALLOW_REMOTE="${COSMOS_ALLOW_REMOTE:-1}"
fi

exec "$PYTHON" -m uvicorn cosmos.webapp:app --host "$COSMOS_HOST" --port "$COSMOS_PORT"
