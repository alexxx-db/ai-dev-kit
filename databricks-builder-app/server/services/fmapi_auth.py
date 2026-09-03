"""Project-local FMAPI authentication for deployed Claude subprocesses."""

import json
import os
import tempfile
from pathlib import Path

TOKEN_FILE_NAME = '.anthropic_token'
HELPER_SCRIPT_NAME = 'get_anthropic_token.sh'
SETTINGS_FILE = Path('.claude/settings.json')


def is_deployed_mode() -> bool:
  """Return whether the Databricks Apps service principal is available."""
  return bool(os.environ.get('DATABRICKS_CLIENT_ID'))


def _atomic_write(path: Path, content: str, *, mode: int) -> None:
  """Atomically replace a credential file with restrictive permissions."""
  path.parent.mkdir(parents=True, exist_ok=True)
  fd, temporary_path = tempfile.mkstemp(
    dir=str(path.parent),
    prefix=f'.{path.name}.',
    suffix='.tmp',
  )
  try:
    os.fchmod(fd, mode)
    with os.fdopen(fd, 'w') as handle:
      handle.write(content)
    os.replace(temporary_path, path)
  except Exception:
    try:
      os.unlink(temporary_path)
    except OSError:
      pass
    raise


def ensure_project_disables_mcp(project_dir: Path) -> None:
  """Ensure project Claude settings explicitly disable MCP servers.

  Safe for local and deployed. Merges into existing settings.json when present
  so deployed apiKeyHelper config is preserved.
  """
  settings_path = project_dir / SETTINGS_FILE
  settings: dict = {}
  if settings_path.exists():
    try:
      loaded = json.loads(settings_path.read_text())
      if isinstance(loaded, dict):
        settings = loaded
    except json.JSONDecodeError:
      settings = {}

  settings['enableAllProjectMcpServers'] = False
  settings['mcpServers'] = {}
  _atomic_write(settings_path, json.dumps(settings, indent=2) + '\n', mode=0o600)


def provision_project_files(
  project_dir: Path,
  *,
  anthropic_base_url: str,
  anthropic_model: str,
  token: str,
) -> None:
  """Write the apiKeyHelper, Claude settings, and current OAuth token."""
  helper_path = project_dir / HELPER_SCRIPT_NAME
  helper_content = (
    '#!/bin/sh\n'
    '# Read the short-lived FMAPI token provisioned by the backend.\n'
    'cat "$(dirname "$0")/.anthropic_token"\n'
  )
  _atomic_write(helper_path, helper_content, mode=0o700)

  settings = {
    'apiKeyHelper': str(helper_path.resolve()),
    'env': {
      'ANTHROPIC_BASE_URL': anthropic_base_url,
      'ANTHROPIC_MODEL': anthropic_model,
      'ANTHROPIC_CUSTOM_HEADERS': 'x-databricks-use-coding-agent-mode: true',
      'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS': '1',
    },
    'enableAllProjectMcpServers': False,
    'mcpServers': {},
  }
  _atomic_write(
    project_dir / SETTINGS_FILE,
    json.dumps(settings, indent=2) + '\n',
    mode=0o600,
  )
  _atomic_write(project_dir / TOKEN_FILE_NAME, token, mode=0o600)
