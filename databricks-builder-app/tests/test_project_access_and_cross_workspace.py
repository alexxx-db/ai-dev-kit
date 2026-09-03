"""Ownership and cross-workspace auth contract tests."""

import asyncio

import pytest
from fastapi import HTTPException
from starlette.requests import Request


def test_require_owned_project_rejects_invalid_project_id(monkeypatch):
  from server.services import project_access

  async def fake_user(_request):
    return 'user@example.com'

  monkeypatch.setattr(project_access, 'get_current_user', fake_user)
  request = Request({'type': 'http', 'headers': []})

  with pytest.raises(HTTPException) as exc:
    asyncio.run(project_access.require_owned_project(request, '../etc/passwd'))

  assert exc.value.status_code == 400
  assert 'Invalid project_id' in exc.value.detail


def test_invoke_agent_uses_require_owned_project_and_requires_cross_workspace_token():
  from pathlib import Path

  source = Path('server/routers/agent.py').read_text()
  invoke = source.split('async def invoke_agent')[1].split('async def stream_progress')[0]
  assert 'await require_owned_project(request, body.project_id)' in invoke
  assert 'target_databricks_token is required when target_databricks_host is set' in invoke
  assert 'project_storage = ProjectStorage(user_email)' not in invoke
  assert 'tools_token = body.target_databricks_token or workspace_token or fmapi_token' not in invoke
