"""Regression tests for deployed-app Phase A fixes."""

import asyncio
from datetime import datetime, timezone


def test_stale_session_retries_once_without_resume():
  from server.routers.agent import _stream_with_stale_session_retry

  attempts = []
  cleared = []

  async def stream_factory(session_id):
    attempts.append(session_id)
    if session_id:
      yield {
        'type': 'error',
        'error': 'No conversation found with session ID: stale-session',
      }
      return
    yield {'type': 'text', 'text': 'fresh response'}

  async def clear_session():
    cleared.append(True)

  async def collect():
    return [
      event
      async for event in _stream_with_stale_session_retry(
        session_id='stale-session',
        stream_factory=stream_factory,
        clear_session=clear_session,
      )
    ]

  events = asyncio.run(collect())

  assert attempts == ['stale-session', None]
  assert cleared == [True]
  assert events == [
    {'type': 'system', 'subtype': 'session_reset', 'data': None},
    {'type': 'text', 'text': 'fresh response'},
  ]


def test_non_session_errors_are_not_retried():
  from server.routers.agent import _stream_with_stale_session_retry

  attempts = []

  async def stream_factory(session_id):
    attempts.append(session_id)
    yield {'type': 'error', 'error': 'API Error: 401'}

  async def clear_session():
    raise AssertionError('unrelated failures must not clear the session')

  async def collect():
    return [
      event
      async for event in _stream_with_stale_session_retry(
        session_id='valid-session',
        stream_factory=stream_factory,
        clear_session=clear_session,
      )
    ]

  events = asyncio.run(collect())

  assert attempts == ['valid-session']
  assert events == [{'type': 'error', 'error': 'API Error: 401'}]


def test_backup_timestamp_is_timezone_aware():
  from server.services.backup_manager import _backup_updated_at

  timestamp = _backup_updated_at()

  assert isinstance(timestamp, datetime)
  assert timestamp.tzinfo == timezone.utc


def test_canonical_me_route_is_registered():
  from server.app import app

  route_paths = {
    route.path for route in app.routes if getattr(route, 'path', None)
  }

  assert '/api/me' in route_paths


def test_fmapi_title_client_enables_coding_agent_mode(monkeypatch):
  from server.services import title_generator

  captured = {}

  class FakeAsyncAnthropic:
    def __init__(self, **kwargs):
      captured.update(kwargs)

  monkeypatch.setattr(title_generator.anthropic, 'AsyncAnthropic', FakeAsyncAnthropic)

  title_generator._create_client(
    databricks_host='https://example.databricks.com',
    databricks_token='oauth-token',
  )

  assert captured['auth_token'] == 'oauth-token'
  assert 'api_key' not in captured
  assert captured['base_url'] == (
    'https://example.databricks.com/serving-endpoints/anthropic'
  )
  assert captured['default_headers'] == {
    'x-databricks-use-coding-agent-mode': 'true',
  }
