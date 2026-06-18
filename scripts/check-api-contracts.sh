#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[contract] checking feed status enum values in shared frontend types..."
if ! rg -q "ACTIVE = 'active'" frontend/packages/types/src/models.ts; then
  echo "ERROR: FeedStatus.ACTIVE must be 'active' in frontend/packages/types/src/models.ts"
  exit 1
fi
if ! rg -q "ERROR = 'error'" frontend/packages/types/src/models.ts; then
  echo "ERROR: FeedStatus.ERROR must be 'error' in frontend/packages/types/src/models.ts"
  exit 1
fi
if ! rg -q "DISABLED = 'disabled'" frontend/packages/types/src/models.ts; then
  echo "ERROR: FeedStatus.DISABLED must be 'disabled' in frontend/packages/types/src/models.ts"
  exit 1
fi
if rg -q "PAUSED = 'PAUSED'" frontend/packages/types/src/models.ts; then
  echo "ERROR: legacy FeedStatus.PAUSED should not exist"
  exit 1
fi

echo "[contract] checking admin/web frontend does not use uppercase feed status literals..."
if rg -n "status\\s*===\\s*'ERROR'|status\\s*===\\s*\"ERROR\"|status\\s*===\\s*'ACTIVE'|status\\s*===\\s*\"ACTIVE\"" \
  frontend/apps/admin/src frontend/apps/web/src \
  -g'*.ts' -g'*.tsx'; then
  echo "ERROR: found uppercase feed status comparisons in frontend code"
  exit 1
fi

echo "[contract] checking backend admin accepts explicit feed status literals..."
if ! rg -q 'Literal\["active", "error", "disabled", "inactive"\]' backend/packages/core/glean_core/schemas/admin.py; then
  echo "ERROR: backend admin feed update schema is missing strict status Literal contract"
  exit 1
fi
if ! rg -q 'Literal\["active", "error", "disabled", "inactive"\]' backend/apps/api/glean_api/routers/admin.py; then
  echo "ERROR: backend admin feed list query status is missing strict Literal contract"
  exit 1
fi

echo "[contract] API contract checks passed."
