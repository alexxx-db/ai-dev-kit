"""Claude Code Agent service for managing agent sessions.

Uses the claude-agent-sdk to create and manage Claude Code agent sessions
with directory-scoped file permissions and skills-driven Databricks CLI access.

Databricks workflows come from project skills. CLI/SDK subprocess auth is
scoped to a per-project profile so local and deployed execution behave alike.

MLflow Tracing:
  Uses ClaudeSDKClient with mlflow.anthropic.autolog() for automatic tracing.
  query() does NOT support tracing -- only ClaudeSDKClient does.
  See: https://mlflow.org/docs/latest/genai/tracing/integrations/listing/claude_code/

NOTE: Fresh event loop workaround applied to fix claude-agent-sdk issue #462
where subprocess transport fails in FastAPI/uvicorn contexts.
See: https://github.com/anthropics/claude-agent-sdk-python/issues/462
"""

import asyncio
import json
import logging
import os
import queue
import sys
import threading
import time
import traceback
from contextvars import copy_context
from pathlib import Path
from typing import AsyncIterator

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient, HookMatcher
from claude_agent_sdk.types import (
  AssistantMessage,
  PermissionResultAllow,
  PermissionResultDeny,
  ResultMessage,
  StreamEvent,
  SystemMessage,
  TextBlock,
  ThinkingBlock,
  ToolPermissionContext,
  ToolResultBlock,
  ToolUseBlock,
  UserMessage,
)
from databricks_tools_core.auth import set_databricks_auth, clear_databricks_auth

from .backup_manager import ensure_project_directory as _ensure_project_directory
from .backup_manager import ensure_project_directory_async as _ensure_project_directory_async
from .cli_auth import build_cli_auth_env
from .fmapi_auth import (
  ensure_project_disables_mcp,
  is_deployed_mode,
  provision_project_files,
)
from .system_prompt import get_system_prompt

logger = logging.getLogger(__name__)

# Built-in Claude Code tools
BUILTIN_TOOLS = [
  'Read',
  'Write',
  'Edit',
  'Bash',
  'Glob',
  'Grep',
]

# Cached Claude settings (loaded once)
_claude_settings = None


def _load_claude_settings() -> dict:
  """Initialize Claude settings dictionary.

  Previously loaded from .claude/settings.json, but now all auth settings
  are injected dynamically from the user's Databricks credentials and
  environment variables set in app.yaml.

  Returns:
      Dictionary of environment variables to pass to Claude subprocess
  """
  global _claude_settings

  if _claude_settings is not None:
    return _claude_settings

  # Start with empty dict - auth settings are added dynamically per-request
  _claude_settings = {}
  return _claude_settings


def _build_claude_auth(
  *,
  project_dir: Path,
  fmapi_host: str | None,
  fmapi_token: str | None,
  databricks_host: str | None = None,
  databricks_token: str | None = None,
) -> dict[str, str]:
  """Configure Claude auth without exposing deployed OAuth tokens in its env."""
  claude_env = dict(_load_claude_settings())
  effective_host = fmapi_host or databricks_host
  effective_token = fmapi_token or databricks_token

  if not effective_host or not effective_token:
    logger.error(
      'FMAPI credentials missing: host=%r, token_present=%s',
      effective_host,
      bool(effective_token),
    )
    return claude_env

  host = effective_host.rstrip('/').removeprefix('https://').removeprefix('http://')
  base_path = os.environ.get(
    'ANTHROPIC_BASE_PATH',
    'serving-endpoints/anthropic',
  ).strip('/')
  anthropic_base_url = f'https://{host}/{base_path}'
  anthropic_model = os.environ.get(
    'ANTHROPIC_MODEL',
    'databricks-claude-opus-4-6',
  )

  if is_deployed_mode():
    provision_project_files(
      project_dir,
      anthropic_base_url=anthropic_base_url,
      anthropic_model=anthropic_model,
      token=effective_token,
    )
    # Relocate Claude's user-scope config (transcripts, live state) into the
    # project so Lakebase backups capture them. Local must NOT set this —
    # it would cut off `claude login` / Keychain credentials.
    claude_env['CLAUDE_CONFIG_DIR'] = str((project_dir / '.claude').resolve())
    logger.warning(
      'Configured deployed FMAPI apiKeyHelper at %s with model %s '
      '(CLAUDE_CONFIG_DIR=%s)',
      project_dir / '.claude' / 'settings.json',
      anthropic_model,
      claude_env['CLAUDE_CONFIG_DIR'],
    )
    return claude_env

  # Preserve the existing local path. Local development does not relocate or
  # overwrite the developer's Claude configuration. Still pin project settings
  # so Claude does not attempt leftover project MCP servers.
  ensure_project_disables_mcp(project_dir)
  claude_env.update({
    'ANTHROPIC_BASE_URL': anthropic_base_url,
    'ANTHROPIC_API_KEY': effective_token,
    'ANTHROPIC_AUTH_TOKEN': '',
    'CLAUDE_CODE_OAUTH_TOKEN': '',
    'ANTHROPIC_MODEL': anthropic_model,
    'ANTHROPIC_CUSTOM_HEADERS': 'x-databricks-use-coding-agent-mode: true',
    'CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS': '1',
  })
  logger.warning(
    'Configured local Databricks model serving: %s with model %s',
    anthropic_base_url,
    anthropic_model,
  )
  return claude_env


def _claude_setting_sources() -> list[str]:
  """Return Claude setting sources for the builder-app agent.

  Always project-only. User-scope settings pull in the host Claude MCP
  ecosystem and can stall local chat startup for minutes.
  """
  return ['project']


def get_project_directory(project_id: str) -> Path:
  """Get the directory path for a project.

  Prefer ``get_project_directory_async`` from async handlers so Lakebase
  restore is awaited before session resume.
  """
  return _ensure_project_directory(project_id)


async def get_project_directory_async(project_id: str) -> Path:
  """Async project directory ensure — awaits backup restore before return."""
  return await _ensure_project_directory_async(project_id)


def _setup_mlflow_autolog(experiment_name: str | None = None):
  """Enable MLflow autolog for ClaudeSDKClient tracing.

  Must be called before creating a ClaudeSDKClient instance.
  Only ClaudeSDKClient is supported -- query() cannot be traced.

  Args:
      experiment_name: MLflow experiment name or numeric ID
  """
  try:
    import mlflow
    import mlflow.anthropic

    mlflow.set_tracking_uri('databricks')
    if experiment_name:
      if experiment_name.isdigit():
        mlflow.set_experiment(experiment_id=experiment_name)
      else:
        mlflow.set_experiment(experiment_name)
    mlflow.anthropic.autolog()
    logger.info(f'MLflow autolog enabled for experiment: {experiment_name}')
  except ImportError:
    logger.debug('MLflow not available, tracing disabled')
  except Exception as e:
    logger.warning(f'Could not enable MLflow autolog: {e}')


def _run_agent_in_fresh_loop(message, options, result_queue, context, is_cancelled_fn, mlflow_experiment=None):
  """Run agent in a fresh event loop (workaround for issue #462).

  This function runs in a separate thread with a fresh event loop to avoid
  the subprocess transport issues in FastAPI/uvicorn contexts.

  Uses ClaudeSDKClient for proper streaming with MLflow autolog tracing.

  Args:
      message: User message to send to the agent
      options: ClaudeAgentOptions for the agent
      result_queue: Queue to send results back to the main thread
      context: Copy of contextvars context (for Databricks auth, etc.)
      is_cancelled_fn: Callable that returns True if the request has been cancelled
      mlflow_experiment: Optional MLflow experiment name for tracing

  See: https://github.com/anthropics/claude-agent-sdk-python/issues/462
  """
  # Run in the copied context to preserve contextvars (like Databricks auth)
  def run_with_context():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    # Enable MLflow autolog before creating the client
    exp_name = mlflow_experiment or os.environ.get('MLFLOW_EXPERIMENT_NAME')
    if exp_name:
      _setup_mlflow_autolog(exp_name)

    async def run_client():
      """Run agent using ClaudeSDKClient for streaming + MLflow tracing."""
      try:
        msg_count = 0
        async with ClaudeSDKClient(options=options) as client:
          await client.query(message)
          async for msg in client.receive_response():
            msg_count += 1
            msg_type = type(msg).__name__
            logger.info(f"[AGENT] Message #{msg_count}: {msg_type}")

            if is_cancelled_fn():
              logger.info("Agent cancelled by user request")
              result_queue.put(('cancelled', None))
              return
            result_queue.put(('message', msg))
        logger.info(f"[AGENT] Completed after {msg_count} messages")
      except asyncio.CancelledError:
        logger.warning("Agent query was cancelled (asyncio.CancelledError)")
        result_queue.put(('error', Exception("Agent query cancelled - likely due to stream timeout or connection issue")))
      except ConnectionError as e:
        logger.error(f"Connection error in agent query: {e}")
        result_queue.put(('error', Exception(f"Connection error: {e}. This may occur when tools take longer than the stream timeout (50s).")))
      except BrokenPipeError as e:
        logger.error(f"Broken pipe in agent query: {e}")
        result_queue.put(('error', Exception(f"Broken pipe: {e}. The agent subprocess communication was interrupted.")))
      except Exception as e:
        logger.exception(f"Unexpected error in agent query: {type(e).__name__}: {e}")
        result_queue.put(('error', e))
      finally:
        result_queue.put(('done', None))

    try:
      loop.run_until_complete(run_client())
    finally:
      loop.close()

  # Execute in the copied context
  context.run(run_with_context)


def _process_tool_result(block: ToolResultBlock, ask_user_tool_ids: set[str]) -> dict:
  """Extract and normalize content from a ToolResultBlock for streaming."""
  content = block.content
  if isinstance(content, list):
    texts = []
    for item in content:
      if isinstance(item, dict) and 'text' in item:
        texts.append(item['text'])
      elif isinstance(item, str):
        texts.append(item)
      else:
        texts.append(str(item))
    content = '\n'.join(texts) if texts else str(block.content)
  elif not isinstance(content, str):
    content = str(content)

  # Rewrite AskUserQuestion results — the can_use_tool callback provides
  # synthetic answers, but the CLI result text is misleading (e.g. "User has
  # answered your questions: ..."). Replace with a clear message.
  if block.tool_use_id in ask_user_tool_ids:
    content = 'Asking user questions directly in conversation'
  elif block.is_error and 'Stream closed' in content:
    content = f'Tool execution interrupted: {content}. This may occur when operations exceed timeout limits or when the connection is interrupted. Check backend logs for more details.'
    logger.warning(f'Tool result error (improved): {content}')

  return {
    'type': 'tool_result',
    'tool_use_id': block.tool_use_id,
    'content': content,
    'is_error': block.is_error,
  }


async def stream_agent_response(
  project_id: str,
  message: str,
  session_id: str | None = None,
  cluster_id: str | None = None,
  default_catalog: str | None = None,
  default_schema: str | None = None,
  warehouse_id: str | None = None,
  workspace_folder: str | None = None,
  fmapi_host: str | None = None,
  fmapi_token: str | None = None,
  databricks_host: str | None = None,
  databricks_token: str | None = None,
  is_cross_workspace: bool = False,
  is_cancelled_fn: callable = None,
  enabled_skills: list[str] | None = None,
  mlflow_experiment_name: str | None = None,
) -> AsyncIterator[dict]:
  """Stream Claude agent response with all event types.

  Uses ClaudeSDKClient with mlflow.anthropic.autolog() for tracing.
  Yields normalized event dicts for the frontend.

  Args:
      project_id: The project UUID
      message: User message to send
      session_id: Optional session ID for resuming conversations
      cluster_id: Optional Databricks cluster ID for code execution
      default_catalog: Optional default Unity Catalog name
      default_schema: Optional default schema name
      warehouse_id: Optional Databricks SQL warehouse ID for queries
      workspace_folder: Optional workspace folder for file uploads
      fmapi_host: Builder App workspace URL for Claude API (FMAPI)
      fmapi_token: Builder App token for Claude API authentication
      databricks_host: Target workspace URL for Databricks tool operations
      databricks_token: Target workspace token for Databricks tool auth
      is_cross_workspace: When True, tool operations target a different workspace
          than the Builder App. Enables force_token in auth context.
      is_cancelled_fn: Optional callable that returns True if request is cancelled
      enabled_skills: Optional list of enabled skill names. None means all skills.

  Yields:
      Event dicts with 'type' field for frontend consumption
  """
  project_dir = get_project_directory(project_id)

  if session_id:
    logger.info(f'Resuming session {session_id} in {project_dir}: {message[:100]}...')
  else:
    logger.info(f'Starting new session in {project_dir}: {message[:100]}...')

  # Log the working directory for debugging path issues
  logger.info(f'Agent working directory (cwd): {project_dir}')
  logger.info(f'Workspace folder (remote): {workspace_folder}')

  # Set auth context for tool operations (targets the specified workspace)
  # When cross-workspace, force_token ensures the target credentials are used
  # even when OAuth M2M credentials exist in environment
  set_databricks_auth(databricks_host, databricks_token, force_token=is_cross_workspace)

  try:
    # Build allowed tools list
    allowed_tools = BUILTIN_TOOLS.copy()

    # Sync project skills before running the CLI-only agent. Skills contain
    # the Databricks CLI / Python SDK workflows that replace MCP tools.
    from .skills_manager import sync_project_skills, get_available_skills
    sync_project_skills(project_dir, enabled_skills=enabled_skills)

    # Only add the Skill tool if there are enabled skills for the agent to use
    available = get_available_skills(enabled_skills=enabled_skills)
    if available:
      allowed_tools.append('Skill')

    # Generate system prompt with available skills, cluster, warehouse, and catalog/schema context
    system_prompt = get_system_prompt(
      cluster_id=cluster_id,
      default_catalog=default_catalog,
      default_schema=default_schema,
      warehouse_id=warehouse_id,
      workspace_folder=workspace_folder,
      workspace_url=databricks_host,
      enabled_skills=enabled_skills,
    )

    # WARNING so these show up in Databricks Apps logs (INFO can be sparse there).
    logger.warning(
      f'Auth state: fmapi_host={fmapi_host}, databricks_host={databricks_host}, '
      f'is_cross_workspace={is_cross_workspace}, '
      f'fmapi_token_len={len(fmapi_token or "")}, tools_token_len={len(databricks_token or "")}'
    )

    # Deployed mode writes a project-local apiKeyHelper and keeps the OAuth
    # bearer out of the subprocess environment. Local mode retains its existing
    # environment-based Databricks FMAPI path.
    claude_env = _build_claude_auth(
      project_dir=project_dir,
      fmapi_host=fmapi_host,
      fmapi_token=fmapi_token,
      databricks_host=databricks_host,
      databricks_token=databricks_token,
    )
    claude_env.update(
      build_cli_auth_env(
        project_dir,
        host=databricks_host,
        token=databricks_token,
      )
    )

    # Databricks SDK upstream tracking for subprocess user-agent attribution
    from databricks_tools_core.identity import PRODUCT_NAME, PRODUCT_VERSION
    claude_env['DATABRICKS_SDK_UPSTREAM'] = PRODUCT_NAME
    claude_env['DATABRICKS_SDK_UPSTREAM_VERSION'] = PRODUCT_VERSION

    # Ensure stream timeout is set (1 hour to handle long tool sequences)
    stream_timeout = os.environ.get('CLAUDE_CODE_STREAM_CLOSE_TIMEOUT', '3600000')
    claude_env['CLAUDE_CODE_STREAM_CLOSE_TIMEOUT'] = stream_timeout

    # Stderr callback to capture Claude subprocess output for debugging.
    # SDK ProcessError replaces real stderr with a placeholder, so we keep a
    # local buffer and attach it when re-raising.
    claude_stderr_lines: list[str] = []

    def stderr_callback(line: str):
      text = line.strip()
      if text:
        claude_stderr_lines.append(text)
        logger.warning(f'[Claude stderr] {text}')
        print(f'[Claude stderr] {text}', file=sys.stderr, flush=True)

    # Path-scoped Read/Write/Edit + AskUserQuestion handling.
    # Use dontAsk (not bypassPermissions) so this callback actually runs —
    # bypassPermissions skips can_use_tool entirely.
    _PATH_TOOLS = {'Read', 'Write', 'Edit', 'NotebookEdit'}
    _project_root = project_dir.resolve()

    async def can_use_tool(
      tool_name: str, input_data: dict, _context: ToolPermissionContext,
    ) -> PermissionResultAllow | PermissionResultDeny:
      if tool_name == 'AskUserQuestion':
        questions = input_data.get('questions', [])
        answers = {
          q.get('question', ''): 'Please ask this question directly in your text response.'
          for q in questions
        }
        return PermissionResultAllow(
          updated_input={'questions': questions, 'answers': answers},
        )

      if tool_name in _PATH_TOOLS:
        raw = input_data.get('file_path') or input_data.get('notebook_path') or ''
        if raw:
          try:
            target = Path(raw).expanduser().resolve()
          except (OSError, ValueError):
            return PermissionResultDeny(message=f'Invalid path: {raw!r}')
          if not target.is_relative_to(_project_root):
            logger.warning(
              'Denied %s outside project root %s: %s',
              tool_name,
              _project_root,
              target,
            )
            return PermissionResultDeny(
              message=(
                f'File access outside the project directory is not allowed. '
                f'Use a path under {_project_root}.'
              ),
            )

      return PermissionResultAllow(updated_input=input_data)

    # Required for can_use_tool in Python: a PreToolUse hook that keeps the
    # stream open so the permission callback can be invoked.
    async def _keepalive_hook(_input_data, _tool_use_id, _context):
      return {"continue_": True}

    # Always use project settings only. Including "user" inherits the
    # developer's ~/.claude MCP servers (dozens of plugins locally) and can
    # stall the chat for minutes before the first token. Skills are already
    # copied into the project directory.
    setting_sources = _claude_setting_sources()

    options = ClaudeAgentOptions(
      cwd=str(project_dir),
      allowed_tools=allowed_tools,
      permission_mode='dontAsk',  # Enables can_use_tool path allowlist
      can_use_tool=can_use_tool,
      hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[_keepalive_hook])]},
      resume=session_id,  # Resume from previous session if provided
      mcp_servers={},  # Skills + Databricks CLI only (no MCP servers)
      system_prompt=system_prompt,  # Databricks-focused system prompt
      setting_sources=setting_sources,  # Skills from project filesystem
      env=claude_env,  # Deploy uses project apiKeyHelper; local uses FMAPI env.
      include_partial_messages=True,  # Enable token-by-token streaming
      stderr=stderr_callback,  # Capture stderr for debugging
    )
    logger.warning(f'ClaudeAgentOptions setting_sources={setting_sources}')

    # Run agent in fresh event loop to avoid subprocess transport issues (#462)
    # Copy the context to preserve contextvars (Databricks auth) in the new thread
    ctx = copy_context()
    result_queue = queue.Queue()
    # Default to always-false if no cancellation function provided
    cancel_check = is_cancelled_fn if is_cancelled_fn else lambda: False

    # Get MLflow experiment name from request param, falling back to environment
    mlflow_experiment = mlflow_experiment_name or os.environ.get('MLFLOW_EXPERIMENT_NAME')

    agent_thread = threading.Thread(
      target=_run_agent_in_fresh_loop,
      args=(message, options, result_queue, ctx, cancel_check, mlflow_experiment),
      daemon=True
    )
    agent_thread.start()

    # Process messages from the queue with keepalive for long operations
    KEEPALIVE_INTERVAL = 15  # seconds - send keepalive if no activity
    last_activity = time.time()
    # Track AskUserQuestion tool IDs to rewrite their results in the stream
    ask_user_tool_ids: set[str] = set()

    while True:
      # Use timeout on queue.get to allow keepalive emission
      def get_with_timeout():
        try:
          return result_queue.get(timeout=KEEPALIVE_INTERVAL)
        except queue.Empty:
          return ('keepalive', None)

      msg_type, msg = await asyncio.get_event_loop().run_in_executor(
        None, get_with_timeout
      )

      if msg_type == 'keepalive':
        # Emit keepalive event to keep the stream active during long tool execution
        elapsed = time.time() - last_activity
        logger.debug(f'Emitting keepalive after {elapsed:.0f}s of inactivity')
        yield {
          'type': 'keepalive',
          'elapsed_since_last_event': elapsed,
        }
        continue

      # Update last activity time for non-keepalive messages
      last_activity = time.time()

      if msg_type == 'done':
        break
      elif msg_type == 'cancelled':
        logger.info("Agent execution cancelled")
        yield {'type': 'cancelled'}
        break
      elif msg_type == 'error':
        if claude_stderr_lines and isinstance(msg, Exception):
          stderr_tail = '\n'.join(claude_stderr_lines[-40:])
          raise RuntimeError(
            f'{msg}\n--- Claude stderr ---\n{stderr_tail}'
          ) from msg
        raise msg
      elif msg_type == 'message':
        # Handle different message types
        if isinstance(msg, AssistantMessage):
          # Process content blocks
          for block in msg.content:
            if isinstance(block, TextBlock):
              yield {
                'type': 'text',
                'text': block.text,
              }
            elif isinstance(block, ThinkingBlock):
              yield {
                'type': 'thinking',
                'thinking': block.thinking,
              }
            elif isinstance(block, ToolUseBlock):
              # Track AskUserQuestion calls so we can rewrite their results
              if block.name == 'AskUserQuestion':
                ask_user_tool_ids.add(block.id)
              yield {
                'type': 'tool_use',
                'tool_id': block.id,
                'tool_name': block.name,
                'tool_input': block.input,
              }
            elif isinstance(block, ToolResultBlock):
              yield _process_tool_result(block, ask_user_tool_ids)

        elif isinstance(msg, ResultMessage):
          yield {
            'type': 'result',
            'session_id': msg.session_id,
            'duration_ms': msg.duration_ms,
            'total_cost_usd': msg.total_cost_usd,
            'is_error': msg.is_error,
            'num_turns': msg.num_turns,
          }

        elif isinstance(msg, SystemMessage):
          yield {
            'type': 'system',
            'subtype': msg.subtype,
            'data': msg.data if hasattr(msg, 'data') else None,
          }

        elif isinstance(msg, UserMessage):
          # UserMessage can contain tool results (sent back to Claude after tool execution)
          msg_content = msg.content
          if isinstance(msg_content, list):
            for block in msg_content:
              if isinstance(block, ToolResultBlock):
                yield _process_tool_result(block, ask_user_tool_ids)
          # Skip string content (just echo of user input)

        elif isinstance(msg, StreamEvent):
          # Handle streaming events for token-by-token updates
          event_data = msg.event
          event_type = event_data.get('type', '')

          # Handle text delta events (token streaming)
          if event_type == 'content_block_delta':
            delta = event_data.get('delta', {})
            delta_type = delta.get('type', '')
            if delta_type == 'text_delta':
              text = delta.get('text', '')
              if text:
                yield {
                  'type': 'text_delta',
                  'text': text,
                }
            elif delta_type == 'thinking_delta':
              thinking = delta.get('thinking', '')
              if thinking:
                yield {
                  'type': 'thinking_delta',
                  'thinking': thinking,
                }
          # Pass through other stream events if needed
          elif event_type not in ('content_block_start', 'content_block_stop', 'message_start', 'message_delta', 'message_stop'):
            yield {
              'type': 'stream_event',
              'event': event_data,
              'session_id': msg.session_id,
            }

  except Exception as e:
    # Log full traceback for debugging
    error_msg = f'Error during Claude query: {e}'
    full_traceback = traceback.format_exc()

    # Use print to stderr for immediate visibility
    print(f'\n{"="*60}', file=sys.stderr)
    print(f'AGENT ERROR: {error_msg}', file=sys.stderr)
    print(full_traceback, file=sys.stderr)

    # Also log normally
    logger.error(error_msg)
    logger.error(full_traceback)

    # If it's an ExceptionGroup, log all sub-exceptions
    if hasattr(e, 'exceptions'):
      for i, sub_exc in enumerate(e.exceptions):
        sub_tb = ''.join(traceback.format_exception(type(sub_exc), sub_exc, sub_exc.__traceback__))
        print(f'Sub-exception {i}: {sub_exc}', file=sys.stderr)
        print(sub_tb, file=sys.stderr)
        logger.error(f'Sub-exception {i}: {sub_exc}')
        logger.error(sub_tb)

    print(f'{"="*60}\n', file=sys.stderr)

    yield {
      'type': 'error',
      'error': str(e),
    }
  finally:
    # Always clear auth context when done
    clear_databricks_auth()


# Keep simple aliases for backward compatibility
async def simple_query(project_id: str, message: str) -> AsyncIterator[dict]:
  """Simple stateless query to Claude within a project directory."""
  async for event in stream_agent_response(project_id, message):
    yield event
