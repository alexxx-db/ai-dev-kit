"""Databricks CLI authentication for the project-scoped Claude subprocess."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

AUTH_FILE_NAME = '.databrickscfg'
AUTH_FILE_PROFILE = 'DEFAULT'


def _normalize_host(host: str) -> str:
  normalized = host.strip().rstrip('/')
  if not normalized.startswith(('http://', 'https://')):
    normalized = f'https://{normalized}'
  return normalized


def write_project_auth_file(project_dir: Path, host: str, token: str) -> Path:
  """Atomically write a restrictive Databricks CLI profile for this project."""
  normalized_host = _normalize_host(host)
  if not normalized_host or '\n' in normalized_host or '\r' in normalized_host:
    raise ValueError('Invalid Databricks host')
  if not token or '\n' in token or '\r' in token:
    raise ValueError('Invalid Databricks token')

  project_dir.mkdir(parents=True, exist_ok=True)
  target = project_dir / AUTH_FILE_NAME
  content = (
    f'[{AUTH_FILE_PROFILE}]\n'
    f'host = {normalized_host}\n'
    f'token = {token}\n'
  )
  fd, temporary_path = tempfile.mkstemp(
    dir=str(project_dir),
    prefix=f'{AUTH_FILE_NAME}.',
    suffix='.tmp',
  )
  try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, 'w') as handle:
      handle.write(content)
    os.replace(temporary_path, target)
  except Exception:
    try:
      os.unlink(temporary_path)
    except OSError:
      pass
    raise
  return target


def build_cli_auth_env(
  project_dir: Path,
  *,
  host: str | None,
  token: str | None,
) -> dict[str, str]:
  """Return deterministic CLI/SDK auth overrides for Claude's subprocess.

  When request-scoped credentials are available, pin the CLI to a project
  profile. In deployed mode, scrub inherited Apps service-principal variables
  so unified auth cannot select OAuth M2M ahead of the request credential.
  """
  if not host or not token:
    return {}

  auth_file = write_project_auth_file(project_dir, host, token)
  env = {
    'DATABRICKS_CONFIG_FILE': str(auth_file.resolve()),
    'DATABRICKS_CONFIG_PROFILE': AUTH_FILE_PROFILE,
    'DATABRICKS_AUTH_TYPE': 'pat',
  }
  if os.environ.get('DATABRICKS_CLIENT_ID'):
    env.update({
      'DATABRICKS_CLIENT_ID': '',
      'DATABRICKS_CLIENT_SECRET': '',
    })
  return env
