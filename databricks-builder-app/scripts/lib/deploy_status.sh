#!/bin/bash
# Deploy status resolution helpers for deploy.sh.
#
# Sourced rather than executed so the resolution logic can be exercised by
# tests with a stubbed `databricks` on PATH. Every function writes a single
# tab-delimited record to stdout and returns 0; callers branch on the tag.

# Parse stdout of `databricks apps deploy --output json`.
#
# Emits:
#   OK<TAB><state><TAB><deployment_id>
#   PARSE_ERROR<TAB><message>
parse_deploy_response() {
  printf '%s' "${1:-}" | python3 -c '
import sys, json

raw = sys.stdin.read()
try:
    data = json.loads(raw)
except Exception as exc:
    print("PARSE_ERROR\t" + str(exc))
    sys.exit(0)

state = ""
deploy_id = ""
if isinstance(data, dict):
    status = data.get("status") or {}
    if isinstance(status, dict):
        state = status.get("state") or ""
    if not state:
        state = data.get("state") or ""
    deploy_id = data.get("deployment_id") or ""
print("OK\t" + state + "\t" + deploy_id)
'
}

# Confirm the submitted deployment actually reached a terminal state.
#
# `active_deployment` is the last successfully activated deployment, which is
# not necessarily the submission in flight, so its state is only trustworthy
# when the deployment ids match.
#
# Usage: verify_deploy_state <app_name> <submitted_id> [cli args...]
#
# Emits:
#   OK<TAB><state>                         — id match + non-empty state
#   NO_STATE<TAB><active_id>               — id match but status.state empty/null
#   MISMATCH<TAB><active_id><TAB><state>   — different deployment (or none)
#   PARSE_ERROR<TAB><message>
verify_deploy_state() {
  local app_name="${1:-}" submitted="${2:-}"
  shift 2 2>/dev/null || true

  # The submitted id is passed as argv, not as a `VAR=value cmd` prefix: such a
  # prefix binds only to the left-hand side of a pipeline, so the python3 on the
  # right would never observe it and every comparison would silently fail.
  # stderr is merged into the pipe's error path via the outer 2>/dev/null so a
  # python traceback cannot leak into VERIFY_OUT (same posture as parse helpers).
  databricks apps get "$app_name" "$@" --output json 2>/dev/null | python3 -c '
import sys, json

submitted = sys.argv[1] if len(sys.argv) > 1 else ""
try:
    data = json.load(sys.stdin)
except Exception as exc:
    print("PARSE_ERROR\t" + str(exc))
    sys.exit(0)

active = data.get("active_deployment") or {}
active_id = active.get("deployment_id") or ""
state = (active.get("status") or {}).get("state") or ""
if submitted and active_id == submitted:
    if state:
        print("OK\t" + state)
    else:
        print("NO_STATE\t" + active_id)
else:
    print("MISMATCH\t" + active_id + "\t" + state)
' "$submitted" 2>/dev/null || printf 'PARSE_ERROR\tapps get failed\n'
}
