"""Tests for Phase B durable sessions and Phase D hardening."""

import json
import zipfile
from io import BytesIO
from pathlib import Path


def test_deployed_auth_sets_claude_config_dir(tmp_path, monkeypatch):
  from server.services import agent

  monkeypatch.setenv('DATABRICKS_CLIENT_ID', 'app-sp')

  claude_env = agent._build_claude_auth(
    project_dir=tmp_path,
    fmapi_host='https://example.databricks.com',
    fmapi_token='oauth-token',
  )

  assert claude_env['CLAUDE_CONFIG_DIR'] == str((tmp_path / '.claude').resolve())
  assert 'ANTHROPIC_API_KEY' not in claude_env


def test_local_auth_does_not_set_claude_config_dir(tmp_path, monkeypatch):
  from server.services import agent

  monkeypatch.delenv('DATABRICKS_CLIENT_ID', raising=False)

  claude_env = agent._build_claude_auth(
    project_dir=tmp_path,
    fmapi_host='https://example.databricks.com',
    fmapi_token='local-token',
  )

  assert 'CLAUDE_CONFIG_DIR' not in claude_env


def test_backup_excludes_skills_and_keeps_transcripts(tmp_path):
  from server.services.backup_manager import _should_backup_file

  assert not _should_backup_file(
    tmp_path / '.claude' / 'skills' / 'databricks-docs' / 'SKILL.md',
    tmp_path,
  )
  assert _should_backup_file(
    tmp_path / '.claude' / 'projects' / '-app-proj' / 'sess.jsonl',
    tmp_path,
  )
  assert _should_backup_file(tmp_path / 'notebook.py', tmp_path)
  assert not _should_backup_file(tmp_path / 'node_modules' / 'x.js', tmp_path)


def test_relocate_session_transcripts_folds_stale_dirs(tmp_path):
  from server.services.transcript_relocate import (
    relocate_session_transcripts,
    sanitize_cwd,
  )

  project_dir = tmp_path / 'projects' / 'abc'
  project_dir.mkdir(parents=True)
  stale = project_dir / '.claude' / 'projects' / '-old-deploy-path'
  stale.mkdir(parents=True)
  transcript = stale / 'session-1.jsonl'
  transcript.write_text(
    json.dumps({'type': 'user', 'cwd': '/old/deploy/path'}) + '\n',
    encoding='utf-8',
  )

  moved = relocate_session_transcripts(project_dir)
  expected = project_dir / '.claude' / 'projects' / sanitize_cwd(str(project_dir.resolve()))

  assert moved == 1
  assert not stale.exists()
  dest = expected / 'session-1.jsonl'
  assert dest.exists()
  rec = json.loads(dest.read_text(encoding='utf-8').strip())
  assert rec['cwd'] == str(project_dir.resolve())


def test_path_allowlist_denies_outside_project(tmp_path):
  """Unit-test the path check logic used by can_use_tool."""
  project_root = tmp_path.resolve()
  inside = project_root / 'src' / 'a.py'
  inside.parent.mkdir(parents=True)
  inside.write_text('x')
  outside = Path('/tmp/evil.py').resolve()

  assert inside.is_relative_to(project_root)
  assert not outside.is_relative_to(project_root)
