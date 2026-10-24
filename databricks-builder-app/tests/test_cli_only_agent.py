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


def _identity_request(email, token):
  headers = [(b'x-forwarded-email', email.encode()), (b'x-forwarded-user', b'proxy-user')]
  if token:
    headers.append((b'x-forwarded-access-token', token.encode()))
  return Request({'type': 'http', 'headers': headers})


def test_forwarded_email_must_match_token_identity(monkeypatch):
  from server.services import user

  monkeypatch.setenv('ENV', 'production')
  monkeypatch.delenv('BUILDER_APP_TRUSTED_M2M_CALLERS', raising=False)

  async def fake_resolve(token):
    return {'alice-token': 'alice@corp.com', 'sp-token': 'sp-app-id'}[token]

  monkeypatch.setattr(user, '_resolve_bearer_user', fake_resolve)

  assert asyncio.run(user.get_current_user(_identity_request('Alice@corp.com', 'alice-token'))) == 'Alice@corp.com'
  # Spoofed header falls through to the proxy-controlled identity.
  assert asyncio.run(user.get_current_user(_identity_request('bob@corp.com', 'alice-token'))) == 'proxy-user'
  assert asyncio.run(user.get_current_user(_identity_request('bob@corp.com', None))) == 'proxy-user'

  monkeypatch.setenv('BUILDER_APP_TRUSTED_M2M_CALLERS', 'other-sp, SP-APP-ID')
  assert asyncio.run(user.get_current_user(_identity_request('bob@corp.com', 'sp-token'))) == 'bob@corp.com'


def test_session_scope_retries_connection_then_yields_once(monkeypatch):
  from sqlalchemy.exc import OperationalError

  from server.db import database

  monkeypatch.setattr(database, '_SESSION_RETRY_BASE_DELAY', 0)
  sessions = []

  class FakeSession:
    def __init__(self, fail):
      self.fail, self.committed, self.closed = fail, False, False

    async def connection(self):
      if self.fail:
        raise OperationalError('SELECT 1', {}, Exception('connection refused'))

    async def commit(self):
      self.committed = True

    async def rollback(self):
      pass

    async def close(self):
      self.closed = True

  async def fake_get_session():
    sessions.append(FakeSession(fail=len(sessions) == 0))
    return sessions[-1]

  monkeypatch.setattr(database, 'get_session', fake_get_session)

  async def run():
    async with database.session_scope() as session:
      return session

  used = asyncio.run(run())
  assert used is sessions[1] and used.committed and used.closed
  assert sessions[0].closed and not sessions[0].committed
