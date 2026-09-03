# Authentication & Mode Detection (Builder App)

This document describes how the Databricks Builder App authenticates users and
branches local vs deployed behavior for Claude / FMAPI.

## Modes

| Mode | Detection | Claude config | Anthropic / FMAPI auth |
|------|-----------|---------------|------------------------|
| **Local** | `DATABRICKS_CLIENT_ID` unset | Default `~/.claude` (do not relocate) | Env: `ANTHROPIC_API_KEY` + `ANTHROPIC_BASE_URL` via `_build_claude_auth` |
| **Deployed (Apps)** | `DATABRICKS_CLIENT_ID` set (`is_deployed_mode()`) | `CLAUDE_CONFIG_DIR=<project>/.claude` | Project `apiKeyHelper` + `.anthropic_token` + `.claude/settings.json` |

Gate helper: `server/services/fmapi_auth.py` → `is_deployed_mode()`.

**Never** set `CLAUDE_CONFIG_DIR` in local mode — it disconnects `claude login` /
Keychain credentials and breaks local chat.

## User identity

Resolved by `server/services/user.py` → `get_current_user(request)`:

1. `X-Forwarded-Email` (M2M / Apps-forwarded identity)
2. Bearer token identity
3. Local development fallbacks

## Databricks CLI auth vs FMAPI auth

The agent is **skills + Databricks CLI only** (`mcp_servers={}`). No in-process
Databricks MCP tools are registered.

- **Claude / titles**: FMAPI OAuth token (`get_fmapi_token`) for model serving.
- **Skills / Bash / CLI**: request-scoped workspace token via
  `get_current_token()` (`X-Forwarded-Access-Token` on Apps; `DATABRICKS_TOKEN`
  locally). Written to `<project>/.databrickscfg` and selected with
  `DATABRICKS_CONFIG_FILE` / `DATABRICKS_CONFIG_PROFILE=DEFAULT` /
  `DATABRICKS_AUTH_TYPE=pat`. In deployed mode, inherited
  `DATABRICKS_CLIENT_ID` / `SECRET` are scrubbed so the CLI does not run as the
  app service principal. If Apps omit `X-Forwarded-Access-Token`, `invoke_agent`
  fails closed with 401 — it does **not** fall back to the FMAPI token or the
  ambient app SP. Cross-workspace calls require both `target_databricks_host`
  and `target_databricks_token`.
- **App API helpers** (clusters/warehouses list): still use
  `databricks_tools_core.auth` contextvars where needed.

In deployed mode, the FMAPI token is written to `<project>/.anthropic_token` and
read by `get_anthropic_token.sh` (Claude `apiKeyHelper`). FMAPI token files and
`.databrickscfg` must **not** appear in Lakebase project backups.

## Session durability (deploy)

1. Transcripts land under `<project>/.claude/projects/` because `CLAUDE_CONFIG_DIR`
   points at the project `.claude` tree.
2. Backup zip includes `.claude/projects/**` and related live state; excludes
   skills, credentials, settings, venvs, and FMAPI helper files.
3. On restore, `relocate_session_transcripts()` folds stale deploy-path transcript
   dirs into the current cwd encoding.
4. Invoke awaits `get_project_directory_async()` so restore finishes before resume.
5. Soft-fail: if Claude reports `No conversation found with session ID`, clear
   `session_id` and retry once without resume.

## Clear session API

`POST /api/projects/{project_id}/conversations/{conversation_id}/session/clear`

Deletes stored messages and nulls `session_id` so the next turn starts fresh.

## Path allowlist

`Read` / `Write` / `Edit` / `NotebookEdit` are denied outside the project
directory via `can_use_tool` with `permission_mode=dontAsk`.
