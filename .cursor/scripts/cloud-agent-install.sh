#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

export PIP_DISABLE_PIP_VERSION_CHECK=1
python3 -m pip install --user -r backend/requirements.txt
python3 -m pip install --user -r requirements.txt

cd frontend
npm ci

cd "$ROOT"
mkdir -p backend/uploads
