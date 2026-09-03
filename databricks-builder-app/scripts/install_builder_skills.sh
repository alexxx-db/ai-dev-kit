#!/bin/bash
#
# Builder App skills installer — mirrors ai-dev-kit PR #562 (install-from-databricks-agent-skills).
#
# Installs Databricks agent skills via `databricks aitools install` and MLflow skills via
# raw fetch from mlflow/skills. Output lands in .claude/skills/ as real directories (copied
# from the aitools canonical store) so deploy bundles are self-contained.
#
# Usage:
#   ./scripts/install_builder_skills.sh              # from builder-app root
#   ./scripts/install_builder_skills.sh --silent     # non-interactive (deploy)
#   ./scripts/install_builder_skills.sh --profile prod
#
# Requires: Databricks CLI v1.0.0+ (databricks aitools), curl, git (for ref resolution).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="${PROJECT_DIR:-$(dirname "$SCRIPT_DIR")}"

MIN_AITOOLS_CLI_VERSION="1.0.0"
# CLI ≥1.6 is plugin-first; Builder App needs raw skill files via --skills-only.
SKILLS_ONLY_CLI_VERSION="1.6.0"
# Pinned so two deploys of the same builder-app commit ship identical skill content.
# mlflow/skills publishes no tags, so this is a commit SHA on main; bump deliberately
# after reviewing upstream changes. Override with MLFLOW_REF=main to track latest.
MLFLOW_REF="${MLFLOW_REF:-c8228eef0da8d18ac34aa632e1276ce7da985363}"
PROFILE="${DATABRICKS_CONFIG_PROFILE:-DEFAULT}"
SILENT=false
INSTALL_EXPERIMENTAL=true
# Set ALLOW_EMPTY_MLFLOW_SKILLS=1 to allow deploy/setup when MLflow fetch returns zero skills.

# MLflow skills (mlflow/skills repo)
MLFLOW_SKILLS="agent-evaluation analyze-mlflow-chat-session analyze-mlflow-trace instrumenting-with-mlflow-tracing mlflow-onboarding querying-mlflow-metrics retrieving-mlflow-traces searching-mlflow-docs"
MLFLOW_BASE_URL="https://raw.githubusercontent.com/mlflow/skills"

# Offline snapshot used only when `databricks aitools list` is unavailable. It is a
# point-in-time copy and will drift from the live inventory — bump the stamp whenever
# it is refreshed so warnings say which vintage was installed.
AGENT_SKILLS_SNAPSHOT_VERSION="0.2.3"
AGENT_B_STABLE_FALLBACK="databricks-apps databricks-core databricks-dabs databricks-jobs databricks-lakebase databricks-model-serving databricks-pipelines databricks-serverless-migration databricks-vector-search"
AGENT_B_EXPERIMENTAL_FALLBACK="databricks-agent-bricks databricks-ai-functions databricks-aibi-dashboards databricks-apps-python databricks-dbsql databricks-docs databricks-execution-compute databricks-genie databricks-iceberg databricks-lakeflow-connect databricks-metric-views databricks-mlflow-evaluation databricks-python-sdk databricks-spark-structured-streaming databricks-synthetic-data-gen databricks-unity-catalog databricks-unstructured-pdf-generation databricks-zerobus-ingest spark-python-data-source"
AGENT_B_EXCLUDED="databricks-execution-compute"

AGENT_B_STABLE=""
AGENT_B_EXPERIMENTAL=""
SELECTED_AGENT_B_SKILLS=""

G='\033[0;32m' Y='\033[1;33m' R='\033[0;31m' B='\033[1m' D='\033[2m' N='\033[0m'

msg()  { [ "$SILENT" = true ] || echo -e "  $*"; }
ok()   { [ "$SILENT" = true ] || echo -e "  ${G}✓${N} $*"; }
# Warnings always print (even --silent/deploy) so soft failures are not hidden.
warn() { echo -e "  ${Y}!${N} $*" >&2; }
die()  { echo -e "  ${R}✗${N} $*" >&2; exit 1; }
step() { [ "$SILENT" = true ] || echo -e "\n${B}$*${N}"; }

_in_list() { echo "$2" | tr ' ' '\n' | grep -Fxq "$1"; }
_count() { echo $#; }

version_gte() {
  printf '%s\n%s' "$2" "$1" | sort -V -C
}

while [ $# -gt 0 ]; do
  case $1 in
    -p|--profile) PROFILE="$2"; shift 2 ;;
    --silent) SILENT=true; shift ;;
    --experimental)
      case "${2:-}" in
        false|0) INSTALL_EXPERIMENTAL=false; shift 2 ;;
        true|1)  INSTALL_EXPERIMENTAL=true; shift 2 ;;
        *) INSTALL_EXPERIMENTAL=true; shift ;;
      esac
      ;;
    -h|--help)
      echo "Builder App skills installer (databricks aitools + MLflow fetch)"
      echo ""
      echo "Usage: $0 [--silent] [--profile NAME] [--experimental true|false]"
      echo ""
      echo "  --silent              No progress output (errors still print)"
      echo "  -p, --profile NAME    Databricks CLI profile (default: DEFAULT)"
      echo "  --experimental BOOL   Include experimental agent skills (default: true)"
      exit 0
      ;;
    *) die "Unknown option: $1" ;;
  esac
done

# Parse `databricks aitools list -o json` into "<experimental> <name>" lines.
# Exits non-zero when the payload is missing, malformed, or has no usable
# entries, so the caller can distinguish "CLI absent" from "CLI changed shape".
_parse_agent_b_inventory() {
  python3 -c '
import sys, json

try:
    data = json.loads(sys.stdin.read())
except Exception:
    sys.exit(1)

items = None
if isinstance(data, list):
    items = data
elif isinstance(data, dict):
    for key in ("skills", "items", "data", "results"):
        value = data.get(key)
        if isinstance(value, list):
            items = value
            break
if not items:
    sys.exit(1)

lines = []
for item in items:
    if not isinstance(item, dict):
        continue
    name = item.get("name") or item.get("id") or ""
    if not name:
        continue
    experimental = item.get("experimental")
    if isinstance(experimental, str):
        experimental = experimental.strip().lower() in ("true", "1", "yes")
    lines.append(("true" if experimental else "false") + " " + str(name))

if not lines:
    sys.exit(1)
print("\n".join(lines))
'
}

fetch_agent_b_inventory() {
  [ -n "$AGENT_B_STABLE" ] && return

  local json="" list_rc=0
  if command -v databricks >/dev/null 2>&1; then
    json=$(databricks aitools list -o json 2>/dev/null) || list_rc=$?
  else
    list_rc=127
  fi

  if [ "$list_rc" -eq 0 ] && [ -n "$json" ]; then
    local parsed=""
    parsed=$(printf '%s' "$json" | _parse_agent_b_inventory) || parsed=""

    if [ -n "$parsed" ]; then
      AGENT_B_STABLE=$(echo "$parsed" | awk '$1=="false"{print $2}' | tr '\n' ' ')
      AGENT_B_EXPERIMENTAL=$(echo "$parsed" | awk '$1=="true"{print $2}' | tr '\n' ' ')
      [ -n "$AGENT_B_STABLE" ] && return
    fi

    # The CLI answered but we could not read it. Falling back here would ship a
    # silently different skill set behind a green check, so treat it as fatal.
    if [ "${ALLOW_STALE_AGENT_SKILLS:-0}" = "1" ]; then
      warn "Unreadable 'databricks aitools list' output; using snapshot v${AGENT_SKILLS_SNAPSHOT_VERSION} (ALLOW_STALE_AGENT_SKILLS=1)"
    else
      die "Could not parse 'databricks aitools list -o json' — the CLI output format may have changed.
 Set ALLOW_STALE_AGENT_SKILLS=1 to install the offline snapshot (v${AGENT_SKILLS_SNAPSHOT_VERSION}) instead."
    fi
  fi

  AGENT_B_STABLE="$AGENT_B_STABLE_FALLBACK"
  AGENT_B_EXPERIMENTAL="$AGENT_B_EXPERIMENTAL_FALLBACK"
  warn "Databricks CLI inventory unavailable; using offline agent-skills snapshot v${AGENT_SKILLS_SNAPSHOT_VERSION} (may differ from the live aitools inventory)"
}

resolve_all_agent_skills() {
  fetch_agent_b_inventory
  SELECTED_AGENT_B_SKILLS=""
  local skill
  for skill in $AGENT_B_STABLE $AGENT_B_EXPERIMENTAL; do
    _in_list "$skill" "$AGENT_B_EXCLUDED" && continue
    [ "$INSTALL_EXPERIMENTAL" = false ] && _in_list "$skill" "$AGENT_B_EXPERIMENTAL" && continue
    SELECTED_AGENT_B_SKILLS="${SELECTED_AGENT_B_SKILLS:+$SELECTED_AGENT_B_SKILLS }$skill"
  done
}

ensure_aitools_cli() {
  local cli_version=""
  if command -v databricks >/dev/null 2>&1; then
    cli_version=$(databricks --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  fi
  if [ -n "$cli_version" ] && version_gte "$cli_version" "$MIN_AITOOLS_CLI_VERSION"; then
    return 0
  fi

  local found_msg="Databricks CLI not found."
  [ -n "$cli_version" ] && found_msg="Databricks CLI v${cli_version} is too old."

  die "$found_msg Agent skills require Databricks CLI v${MIN_AITOOLS_CLI_VERSION}+.
 Upgrade: curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh | sh
 Then re-run this installer."
}

agent_b_needs_experimental() {
  local skill
  for skill in $SELECTED_AGENT_B_SKILLS; do
    _in_list "$skill" "$AGENT_B_EXPERIMENTAL" && return 0
  done
  return 1
}

# Remove stale real copies of agent-managed skill dirs (aitools won't overwrite them).
cleanup_stale_agent_skills() {
  local skills_dir="$PROJECT_DIR/.claude/skills"
  [ -d "$skills_dir" ] || return 0
  local skill
  for skill in $SELECTED_AGENT_B_SKILLS; do
    if [ -d "$skills_dir/$skill" ] && [ ! -L "$skills_dir/$skill" ]; then
      # :? guards against an empty expansion turning this into `rm -rf /`.
      rm -rf "${skills_dir:?}/${skill:?}"
      msg "${D}Removed stale bundled copy: $skill${N}"
    fi
  done
}

install_agent_skills() {
  [ -z "$SELECTED_AGENT_B_SKILLS" ] && return 0

  step "Installing agent skills (via databricks aitools)"
  ensure_aitools_cli
  cleanup_stale_agent_skills

  local skills_csv exp_flag="" skills_only_flag="" count cli_version=""
  skills_csv=$(echo "$SELECTED_AGENT_B_SKILLS" | tr -s ' ' ',' | sed 's/^,//;s/,$//')
  agent_b_needs_experimental && exp_flag="--experimental"
  count=$(_count $SELECTED_AGENT_B_SKILLS)

  # Plugin-first CLIs install the agent plugin by default; --skills-only forces
  # raw files into .databricks/aitools/skills so we can copy them for deploy.
  # Older CLIs reject the flag — only pass it when supported.
  cli_version=$(databricks --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)
  if [ -n "$cli_version" ] && version_gte "$cli_version" "$SKILLS_ONLY_CLI_VERSION"; then
    skills_only_flag="--skills-only"
  fi

  cd "$PROJECT_DIR"
  local aitools_out aitools_rc attempt
  for attempt in 1 2; do
    aitools_out=$(databricks aitools install --scope project --agents claude-code --skills "$skills_csv" $skills_only_flag $exp_flag -p "$PROFILE" 2>&1) && aitools_rc=0 || aitools_rc=$?
    if [ "$aitools_rc" -eq 0 ]; then
      break
    fi
    if [ "$attempt" -eq 1 ]; then
      warn "databricks aitools install failed (attempt 1); retrying once..."
      sleep 2
    fi
  done
  if [ "$SILENT" != true ] && [ -n "$aitools_out" ]; then
    echo "$aitools_out" | grep -v 'does not support project-scoped skills' || true
  fi
  if [ "$aitools_rc" -ne 0 ]; then
    # Always surface the CLI error — silent mode used to swallow it entirely.
    echo "$aitools_out" >&2
    die "databricks aitools install failed (exit $aitools_rc)"
  fi
  ok "Agent skills ($count) installed via aitools"

  # Copy real files into .claude/skills for deploy bundling (not symlinks).
  local store="$PROJECT_DIR/.databricks/aitools/skills"
  local dest="$PROJECT_DIR/.claude/skills"
  mkdir -p "$dest"
  for skill in $SELECTED_AGENT_B_SKILLS; do
    if [ ! -d "$store/$skill" ]; then
      warn "Agent skill '$skill' missing from aitools store — skipped"
      continue
    fi
    # :? guards against an empty expansion turning this into `rm -rf /`.
    rm -rf "${dest:?}/${skill:?}"
    cp -R "$store/$skill" "$dest/$skill"
  done
  ok "Agent skills copied to .claude/skills/"
}

install_mlflow_skills() {
  step "Installing MLflow skills"
  local dest="$PROJECT_DIR/.claude/skills"
  mkdir -p "$dest"
  local mlflow_raw_url="$MLFLOW_BASE_URL/${MLFLOW_REF}"
  local count=0 skill

  for skill in $MLFLOW_SKILLS; do
    local dest_dir="$dest/$skill"
    mkdir -p "$dest_dir"
    local url="$mlflow_raw_url/$skill/SKILL.md"
    if curl -fsSL "$url" -o "$dest_dir/SKILL.md" 2>/dev/null; then
      for ref in reference.md examples.md api.md; do
        curl -fsSL "$mlflow_raw_url/$skill/$ref" -o "$dest_dir/$ref" 2>/dev/null || true
      done
      count=$((count + 1))
    else
      rm -rf "$dest_dir"
      warn "Could not fetch MLflow skill: $skill"
    fi
  done
  local expected
  expected=$(_count $MLFLOW_SKILLS)
  # A partial fetch is as silent as an empty one: some skills simply go missing
  # while the installer still reports success. Treat any shortfall as an error.
  local allow_shortfall="${ALLOW_PARTIAL_MLFLOW_SKILLS:-${ALLOW_EMPTY_MLFLOW_SKILLS:-0}}"

  if [ "$count" -lt "$expected" ]; then
    if [ "$allow_shortfall" = "1" ]; then
      warn "MLflow skills incomplete: ${count}/${expected} installed (override set)"
    else
      die "MLflow skills incomplete: ${count}/${expected} installed from ${mlflow_raw_url}.
 Set ALLOW_PARTIAL_MLFLOW_SKILLS=1 to continue anyway, or point MLFLOW_REF at a reachable ref."
    fi
  else
    ok "MLflow skills ($count/$expected) → .claude/skills/"
  fi
}

# ─── Main ─────────────────────────────────────────────────────
# Guarded so tests can source this file for its helpers without installing.
if [ "${BASH_SOURCE[0]}" = "${0}" ]; then
  resolve_all_agent_skills
  install_agent_skills
  install_mlflow_skills

  if [ "$SILENT" != true ]; then
    total=$(_count $SELECTED_AGENT_B_SKILLS $MLFLOW_SKILLS)
    echo ""
    echo -e "  ${G}Done.${N} ${total} skills available under .claude/skills/"
  fi
fi
