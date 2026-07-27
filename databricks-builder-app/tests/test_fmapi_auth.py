"""Regression tests for deploy-only FMAPI authentication."""

import json
import stat


def test_provision_project_files_uses_api_key_helper(tmp_path):
  from server.services.fmapi_auth import provision_project_files

  provision_project_files(
    tmp_path,
    anthropic_base_url='https://example.databricks.com/serving-endpoints/anthropic',
    anthropic_model='databricks-claude-opus-4-6',
    token='oauth-token',
  )

  token_file = tmp_path / '.anthropic_token'
  helper_file = tmp_path / 'get_anthropic_token.sh'
  settings_file = tmp_path / '.claude' / 'settings.json'

  assert token_file.read_text() == 'oauth-token'
  assert helper_file.read_text().endswith('cat "$(dirname "$0")/.anthropic_token"\n')
  assert stat.S_IMODE(token_file.stat().st_mode) == 0o600
  assert stat.S_IMODE(helper_file.stat().st_mode) == 0o700

  settings = json.loads(settings_file.read_text())
  assert settings == {
    'apiKeyHelper': str(helper_file.resolve()),
    'env': {
      'ANTHROPIC_BASE_URL': (
        'https://example.databricks.com/serving-endpoints/anthropic'
      ),
      'ANTHROPIC_MODEL': 'databricks-claude-opus-4-6',
      'ANTHROPIC_CUSTOM_HEADERS': 'x-databricks-use-coding-agent-mode: true',
      'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS': '1',
    },
    'enableAllProjectMcpServers': False,
    'mcpServers': {},
  }


def test_local_auth_writes_mcp_disabled_project_settings(tmp_path, monkeypatch):
  from server.services import agent

  monkeypatch.delenv('DATABRICKS_CLIENT_ID', raising=False)

  agent._build_claude_auth(
    project_dir=tmp_path,
    fmapi_host='https://example.databricks.com',
    fmapi_token='local-token',
  )

  settings = json.loads((tmp_path / '.claude' / 'settings.json').read_text())
  assert settings['enableAllProjectMcpServers'] is False
  assert settings['mcpServers'] == {}
  assert 'apiKeyHelper' not in settings


def test_deployed_agent_auth_keeps_oauth_token_out_of_subprocess_env(
  tmp_path,
  monkeypatch,
):
  from server.services import agent

  monkeypatch.setenv('DATABRICKS_CLIENT_ID', 'app-service-principal')

  claude_env = agent._build_claude_auth(
    project_dir=tmp_path,
    fmapi_host='https://example.databricks.com',
    fmapi_token='oauth-token',
  )

  assert 'oauth-token' not in claude_env.values()
  assert 'ANTHROPIC_API_KEY' not in claude_env
  assert 'ANTHROPIC_AUTH_TOKEN' not in claude_env
  assert 'ANTHROPIC_BASE_URL' not in claude_env
  assert (tmp_path / '.anthropic_token').read_text() == 'oauth-token'


def test_local_agent_auth_preserves_existing_environment_path(
  tmp_path,
  monkeypatch,
):
  from server.services import agent

  monkeypatch.delenv('DATABRICKS_CLIENT_ID', raising=False)
  monkeypatch.setenv('ANTHROPIC_MODEL', 'databricks-claude-opus-4-6')

  claude_env = agent._build_claude_auth(
    project_dir=tmp_path,
    fmapi_host='https://example.databricks.com',
    fmapi_token='local-token',
  )

  assert claude_env['ANTHROPIC_API_KEY'] == 'local-token'
  assert claude_env['ANTHROPIC_BASE_URL'] == (
    'https://example.databricks.com/serving-endpoints/anthropic'
  )
  assert claude_env['ANTHROPIC_MODEL'] == 'databricks-claude-opus-4-6'
  assert not (tmp_path / '.anthropic_token').exists()
  assert 'CLAUDE_CONFIG_DIR' not in claude_env


def test_fmapi_credentials_are_excluded_from_project_backups(tmp_path):
  from server.services.backup_manager import _should_backup_file

  assert not _should_backup_file(tmp_path / '.anthropic_token', tmp_path)
  assert not _should_backup_file(tmp_path / 'get_anthropic_token.sh', tmp_path)
  assert not _should_backup_file(tmp_path / '.claude' / 'settings.json', tmp_path)
  assert not _should_backup_file(
    tmp_path / '.claude' / 'skills' / 'x' / 'SKILL.md',
    tmp_path,
  )
  assert _should_backup_file(tmp_path / 'notebook.py', tmp_path)
  assert _should_backup_file(
    tmp_path / '.claude' / 'projects' / 'x' / 's.jsonl',
    tmp_path,
  )


def test_agent_setting_sources_are_project_only():
  from server.services.agent import _claude_setting_sources

  assert _claude_setting_sources() == ['project']
