"""Regression tests for the skills + Databricks CLI-only agent."""

import stat
import asyncio

from starlette.requests import Request


def test_project_cli_auth_file_is_restrictive_and_scrubs_deployed_sp(
  tmp_path,
  monkeypatch,
):
  from server.services.cli_auth import build_cli_auth_env

  monkeypatch.setenv('DATABRICKS_CLIENT_ID', 'app-sp')
  monkeypatch.setenv('DATABRICKS_CLIENT_SECRET', 'app-secret')

  env = build_cli_auth_env(
    tmp_path,
    host='https://example.databricks.com/',
    token='request-token',
  )

  auth_file = tmp_path / '.databrickscfg'
  assert auth_file.read_text() == (
    '[DEFAULT]\n'
    'host = https://example.databricks.com\n'
    'token = request-token\n'
  )
  assert stat.S_IMODE(auth_file.stat().st_mode) == 0o600
  assert env == {
    'DATABRICKS_CONFIG_FILE': str(auth_file.resolve()),
    'DATABRICKS_CONFIG_PROFILE': 'DEFAULT',
    'DATABRICKS_AUTH_TYPE': 'pat',
    'DATABRICKS_CLIENT_ID': '',
    'DATABRICKS_CLIENT_SECRET': '',
  }


def test_apps_request_token_is_used_for_cli_auth(monkeypatch):
  from server.services.user import get_current_token

  monkeypatch.setenv('ENV', 'production')
  request = Request({
    'type': 'http',
    'headers': [(b'x-forwarded-access-token', b'user-token')],
  })

  assert asyncio.run(get_current_token(request)) == 'user-token'


def test_deployed_missing_forwarded_token_returns_none(monkeypatch):
  from server.services.user import get_current_token

  monkeypatch.setenv('ENV', 'production')
  request = Request({'type': 'http', 'headers': []})

  assert asyncio.run(get_current_token(request)) is None


def test_cli_auth_env_without_token_does_not_scrub_or_write(tmp_path, monkeypatch):
  from server.services.cli_auth import build_cli_auth_env

  monkeypatch.setenv('DATABRICKS_CLIENT_ID', 'app-sp')
  monkeypatch.setenv('DATABRICKS_CLIENT_SECRET', 'app-secret')

  env = build_cli_auth_env(tmp_path, host='https://example.databricks.com', token=None)

  assert env == {}
  assert not (tmp_path / '.databrickscfg').exists()


def test_invoke_agent_tools_token_excludes_fmapi_fallback():
  from pathlib import Path

  source = Path('server/routers/agent.py').read_text()
  assert 'tools_token = body.target_databricks_token or workspace_token or fmapi_token' not in source
  assert 'tools_token = body.target_databricks_token or workspace_token' in source
  assert 'if not tools_token and is_deployed_mode():' in source
  assert 'to the app service principal.' in source


def test_cli_only_agent_enables_bash_and_has_no_mcp_loader():
  from server.services import agent

  assert 'Bash' in agent.BUILTIN_TOOLS
  assert not hasattr(agent, 'get_databricks_tools')


def test_cli_auth_file_is_excluded_from_backup(tmp_path):
  from server.services.backup_manager import _should_backup_file

  assert not _should_backup_file(tmp_path / '.databrickscfg', tmp_path)
  assert not _should_backup_file(tmp_path / '.databrickscfg.tmp', tmp_path)


def test_system_prompt_is_cli_only_not_mcp():
  from server.services.system_prompt import get_system_prompt

  prompt = get_system_prompt(warehouse_id='wh-123')
  assert 'skills + Databricks CLI only' in prompt
  assert 'Use MCP tools' not in prompt
  assert 'execute_sql' not in prompt
  assert 'execute_code' not in prompt
  assert 'Never invent third-party MCP servers' in prompt
  assert 'warehouse_id' in prompt
  assert 'databricks' in prompt.lower()
