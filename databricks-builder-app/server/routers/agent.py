"""Claude Code agent invocation endpoints.

Handles async streaming responses from Claude Code agent sessions with SSE.

The async pattern:
1. POST /invoke_agent - Starts agent, returns execution_id immediately
2. POST /stream_progress/{execution_id} - SSE stream of events (50-second windows)
3. POST /stop_stream/{execution_id} - Cancel execution
"""

import asyncio
import json
import logging
from datetime import datetime
from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from ..services.active_stream import get_stream_manager
from ..services.agent import get_project_directory, get_project_directory_async, stream_agent_response
from ..services.backup_manager import mark_for_backup
from ..services.fmapi_auth import is_deployed_mode
from ..services.project_access import require_owned_project, require_stream_owner
from ..services.storage import ConversationStorage
from ..services.title_generator import generate_title_async
from ..services.user import get_current_token, get_fmapi_token, get_workspace_url

logger = logging.getLogger(__name__)
router = APIRouter()

# SSE streaming window duration (seconds) - break before 60s timeout
SSE_WINDOW_SECONDS = 50


def sse_event(data: dict) -> str:
    """Format data as SSE event."""
    return f'data: {json.dumps(data)}\n\n'


class InvokeAgentRequest(BaseModel):
    """Request to invoke the Claude Code agent."""

    project_id: str
    conversation_id: Optional[str] = None  # Will create new if not provided
    message: str
    cluster_id: Optional[str] = None  # Databricks cluster for code execution
    default_catalog: Optional[str] = None  # Default Unity Catalog
    default_schema: Optional[str] = None  # Default schema
    warehouse_id: Optional[str] = None  # Databricks SQL warehouse for queries
    workspace_folder: Optional[str] = None  # Workspace folder for file uploads
    mlflow_experiment_name: Optional[str] = None  # MLflow experiment name for tracing
    target_databricks_host: Optional[str] = None  # Target workspace URL for cross-workspace ops
    target_databricks_token: Optional[str] = None  # Pre-generated OAuth token for target workspace


class InvokeAgentResponse(BaseModel):
    """Response from invoke_agent with execution tracking info."""

    execution_id: str
    conversation_id: str


class StreamProgressRequest(BaseModel):
    """Request to stream progress from an active execution."""

    last_event_timestamp: Optional[float] = None


class StopStreamResponse(BaseModel):
    """Response from stop_stream endpoint."""

    success: bool
    message: str


_MISSING_SESSION_ERROR = 'No conversation found with session ID'


async def _stream_with_stale_session_retry(
    *,
    session_id: Optional[str],
    stream_factory: Callable[[Optional[str]], AsyncIterator[dict]],
    clear_session: Callable[[], Awaitable[None]],
) -> AsyncIterator[dict]:
    """Retry once without resume when Claude's persisted session is missing."""
    current_session_id = session_id

    while True:
        retry_fresh = False
        async for event in stream_factory(current_session_id):
            if (
                current_session_id
                and event.get('type') == 'error'
                and _MISSING_SESSION_ERROR in str(event.get('error', ''))
            ):
                retry_fresh = True
                break
            yield event

        if not retry_fresh:
            return

        logger.warning(
            'Claude session %s is unavailable; clearing it and retrying once',
            current_session_id,
        )
        await clear_session()
        current_session_id = None
        yield {'type': 'system', 'subtype': 'session_reset', 'data': None}


@router.post('/invoke_agent', response_model=InvokeAgentResponse)
async def invoke_agent(request: Request, body: InvokeAgentRequest):
    """Start the Claude Code agent asynchronously.

    Creates a new conversation if conversation_id is not provided.
    Returns execution_id immediately for streaming progress.

    The agent runs in the background and events are accumulated.
    Use POST /stream_progress/{execution_id} to stream events via SSE.
    Use POST /stop_stream/{execution_id} to cancel execution.
    """
    logger.info(
        f'Invoking agent for project: {body.project_id}, conversation: {body.conversation_id}'
    )

    # Validate project ownership first (UUID → 400, missing → 404).
    user_email, _project = await require_owned_project(request, body.project_id)
    fmapi_token = await get_fmapi_token(request)
    workspace_token = await get_current_token(request)
    workspace_url = get_workspace_url()

    # FMAPI (Claude API) always uses the Builder App's own workspace
    fmapi_host = workspace_url

    # Cross-workspace CLI auth requires an explicit target token. Pairing the
    # builder-app forwarded token with a foreign host produces opaque CLI
    # failures of the same class as the FMAPI fallback we removed.
    if body.target_databricks_host and not body.target_databricks_token:
        raise HTTPException(
            status_code=400,
            detail='target_databricks_token is required when target_databricks_host is set',
        )

    # Skills/CLI operations target the caller-specified workspace when present.
    # Prefer the Apps proxy's request-scoped user token. Never fall back to the
    # FMAPI/model-serving token — that is a different credential and produces
    # opaque CLI failures. In deployed mode, refuse to run without a workspace
    # token rather than silently inheriting the app service principal.
    is_cross_workspace = body.target_databricks_host is not None
    tools_host = body.target_databricks_host or workspace_url
    tools_token = body.target_databricks_token or workspace_token
    if not tools_token and is_deployed_mode():
        raise HTTPException(
            status_code=401,
            detail=(
                'No workspace access token available. Databricks Apps must provide '
                'X-Forwarded-Access-Token for CLI operations. Refusing to fall back '
                'to the app service principal.'
            ),
        )

    # Read enabled skills from project filesystem (not DB). Await restore so
    # Claude transcripts are on disk before session resume.
    from ..services.skills_manager import get_project_enabled_skills
    project_dir = await get_project_directory_async(body.project_id)
    enabled_skills = get_project_enabled_skills(project_dir)

    # Get or create conversation
    conv_storage = ConversationStorage(user_email, body.project_id)
    conversation_id = body.conversation_id

    if not conversation_id:
        # Create new conversation with temporary title (will be updated by AI)
        temp_title = body.message[:40].strip()
        if len(body.message) > 40:
            temp_title = temp_title.rsplit(' ', 1)[0] + '...'
        conversation = await conv_storage.create(title=temp_title)
        conversation_id = conversation.id
        logger.info(f'Created new conversation: {conversation_id}')

        # Generate AI title in the background (fire-and-forget)
        # Title generation calls the Claude API, so always use FMAPI creds
        asyncio.create_task(
            generate_title_async(
                message=body.message,
                conversation_id=conversation_id,
                user_email=user_email,
                project_id=body.project_id,
                databricks_host=fmapi_host,
                databricks_token=fmapi_token,
            )
        )
    else:
        # Verify conversation exists and get session_id for resumption
        conversation = await conv_storage.get(conversation_id)
        if not conversation:
            logger.error(f'Conversation not found: {conversation_id}')
            raise HTTPException(status_code=404, detail=f'Conversation not found: {conversation_id}')

    # Get session_id from conversation for resumption
    session_id = conversation.session_id if conversation else None

    # Create active stream with user_email for persistence
    stream_manager = get_stream_manager()
    stream = await stream_manager.create_stream(
        project_id=body.project_id,
        conversation_id=conversation_id,
        user_email=user_email,
    )

    # Emit conversation_id as first event
    stream.add_event({'type': 'conversation.created', 'conversation_id': conversation_id})

    # Create the agent coroutine that will run in background
    async def run_agent():
        """Run the agent and accumulate events in the stream."""
        final_text = ''
        new_session_id: Optional[str] = None
        error_message: Optional[str] = None
        received_deltas = False  # Track if we received streaming deltas

        try:
            def stream_factory(resume_session_id: Optional[str]) -> AsyncIterator[dict]:
                return stream_agent_response(
                    project_id=body.project_id,
                    message=body.message,
                    session_id=resume_session_id,
                    cluster_id=body.cluster_id,
                    default_catalog=body.default_catalog,
                    default_schema=body.default_schema,
                    warehouse_id=body.warehouse_id,
                    workspace_folder=body.workspace_folder,
                    fmapi_host=fmapi_host,
                    fmapi_token=fmapi_token,
                    databricks_host=tools_host,
                    databricks_token=tools_token,
                    is_cross_workspace=is_cross_workspace,
                    is_cancelled_fn=lambda: stream.is_cancelled,
                    enabled_skills=enabled_skills,
                    mlflow_experiment_name=body.mlflow_experiment_name,
                )

            async def clear_stale_session() -> None:
                await conv_storage.update_session_id(conversation_id, None)

            # Stream all events from Claude
            # Pass a cancellation check function so the agent thread can stop early
            async for event in _stream_with_stale_session_retry(
                session_id=session_id,
                stream_factory=stream_factory,
                clear_session=clear_stale_session,
            ):
                # Check if cancelled (also checked in agent thread, but double-check here)
                if stream.is_cancelled:
                    logger.info(f'Stream {stream.execution_id} cancelled, stopping agent')
                    break

                event_type = event.get('type', '')

                if event_type == 'text_delta':
                    # Token-by-token streaming - this is preferred
                    text = event.get('text', '')
                    final_text += text
                    received_deltas = True
                    stream.add_event({'type': 'text_delta', 'text': text})

                elif event_type == 'text':
                    # Complete text block - accumulate all text blocks
                    # Claude sends multiple text blocks when there are tool calls in between
                    # We track received_deltas to know if we should also emit text events
                    # (if deltas are being used, the client already has the text token-by-token)
                    text = event.get('text', '')
                    if text:
                        if not received_deltas:
                            # No deltas received, so send complete text blocks to client
                            final_text += text
                            stream.add_event({'type': 'text', 'text': text})
                        # Note: If received_deltas is True, we skip sending 'text' events
                        # because the client already received the same content via 'text_delta'
                        # BUT we still need to track final_text for persistence
                        # The text_delta handler already accumulates to final_text

                elif event_type == 'thinking':
                    stream.add_event({
                        'type': 'thinking',
                        'thinking': event.get('thinking', ''),
                    })

                elif event_type == 'tool_use':
                    tool_name = event.get('tool_name', '')
                    tool_input = event.get('tool_input', {})

                    stream.add_event({
                        'type': 'tool_use',
                        'tool_id': event.get('tool_id', ''),
                        'tool_name': tool_name,
                        'tool_input': tool_input,
                    })

                    # Emit dedicated todos event when TodoWrite is called
                    if tool_name == 'TodoWrite' and 'todos' in tool_input:
                        stream.add_event({
                            'type': 'todos',
                            'todos': tool_input['todos'],
                        })

                elif event_type == 'tool_result':
                    content = event.get('content', '')
                    is_error = event.get('is_error', False)

                    # Detect cascade failure pattern - "Stream closed" errors indicate
                    # the Claude agent subprocess channel is broken
                    if is_error and 'Stream closed' in str(content):
                        logger.error(f'Detected agent stream failure: {content}')
                        # Add context to the error
                        content = (
                            'Agent connection lost: tool execution was interrupted because the '
                            'internal communication channel broke. This usually happens after a '
                            'long-running operation. Please start a new conversation to reset the '
                            f'connection. Original error: {content}'
                        )

                    stream.add_event({
                        'type': 'tool_result',
                        'tool_use_id': event.get('tool_use_id', ''),
                        'content': content,
                        'is_error': is_error,
                    })

                elif event_type == 'result':
                    new_session_id = event.get('session_id')
                    stream.add_event({
                        'type': 'result',
                        'session_id': new_session_id,
                        'duration_ms': event.get('duration_ms'),
                        'total_cost_usd': event.get('total_cost_usd'),
                        'is_error': event.get('is_error', False),
                        'num_turns': event.get('num_turns'),
                    })

                elif event_type == 'error':
                    error_message = event.get('error', 'Unknown error')
                    logger.error(f'Agent error received: {error_message}')
                    stream.add_event({'type': 'error', 'error': error_message})

                elif event_type == 'system':
                    # Extract session_id from init event if not already set
                    data = event.get('data')
                    if event.get('subtype') == 'init' and data and not new_session_id:
                        new_session_id = data.get('session_id')
                    stream.add_event({
                        'type': 'system',
                        'subtype': event.get('subtype', ''),
                        'data': data,
                    })

                elif event_type == 'cancelled':
                    # Agent was cancelled by user request
                    logger.info(f'Stream {stream.execution_id} received cancellation confirmation')
                    stream.add_event({'type': 'cancelled'})
                    break

                elif event_type == 'keepalive':
                    # Keepalive during long tool execution - forward to stream to keep connection alive
                    elapsed = event.get('elapsed_since_last_event', 0)
                    logger.debug(f'Stream {stream.execution_id} keepalive - {elapsed:.0f}s since last event')
                    stream.add_event({
                        'type': 'keepalive',
                        'elapsed_since_last_event': elapsed,
                    })

        except Exception as e:
            import traceback
            error_details = traceback.format_exc()
            logger.error(f'Error during agent stream: {type(e).__name__}: {e}')
            logger.error(f'Agent stream traceback:\n{error_details}')
            print(f'[AGENT STREAM ERROR] {type(e).__name__}: {e}', flush=True)
            print(f'[AGENT STREAM TRACEBACK]\n{error_details}', flush=True)

            # Provide more context for common errors
            error_message = str(e)
            if 'Stream closed' in error_message:
                error_message = f'Agent communication interrupted: {error_message}. This typically occurs when the Claude subprocess terminates unexpectedly. Check backend logs for details.'

            stream.add_event({'type': 'error', 'error': error_message})

        # Save messages to storage after stream completes (if not cancelled)
        if not stream.is_cancelled:
            try:
                # Save user message
                await conv_storage.add_message(
                    conversation_id=conversation_id,
                    role='user',
                    content=body.message,
                )

                # Save assistant response (or error)
                if final_text or error_message:
                    content = final_text if final_text else f'Error: {error_message}'
                    is_error = bool(error_message and not final_text)
                    logger.info(f'Saving assistant message: {len(content)} chars, is_error={is_error}')
                    await conv_storage.add_message(
                        conversation_id=conversation_id,
                        role='assistant',
                        content=content,
                        is_error=is_error,
                    )
                else:
                    logger.warning('No response to save (no text and no error)')

                # Update session_id for conversation resumption
                if new_session_id:
                    await conv_storage.update_session_id(conversation_id, new_session_id)

                # Update cluster_id if provided
                if body.cluster_id:
                    await conv_storage.update_cluster_id(conversation_id, body.cluster_id)

                # Update catalog/schema if provided
                if body.default_catalog or body.default_schema:
                    await conv_storage.update_catalog_schema(
                        conversation_id, body.default_catalog, body.default_schema
                    )

                # Update warehouse_id if provided
                if body.warehouse_id:
                    await conv_storage.update_warehouse_id(conversation_id, body.warehouse_id)

                # Update workspace_folder if provided
                if body.workspace_folder:
                    await conv_storage.update_workspace_folder(conversation_id, body.workspace_folder)

                logger.info(
                    f'Saved messages to conversation {conversation_id}: '
                    f'text={len(final_text)} chars, error={error_message is not None}'
                )

                # Mark project for backup (will be processed by backup worker)
                mark_for_backup(body.project_id)

            except Exception as e:
                logger.error(f'Failed to save messages: {e}')

        # Mark stream as complete
        if error_message and not final_text:
            stream.mark_error(error_message)
        else:
            stream.mark_complete()

    # Start the agent in background
    await stream_manager.start_stream(stream, run_agent)

    return InvokeAgentResponse(
        execution_id=stream.execution_id,
        conversation_id=conversation_id,
    )


@router.post('/stream_progress/{execution_id}')
async def stream_progress(request: Request, execution_id: str, body: StreamProgressRequest):
    """Stream events from an active execution via SSE.

    This endpoint streams events as Server-Sent Events (SSE).
    It runs for up to 50 seconds before sending a reconnect signal,
    allowing clients to reconnect before the 60-second HTTP timeout.

    Args:
        execution_id: The execution ID from invoke_agent
        body: Request body with last_event_timestamp for resuming

    Returns:
        SSE stream of events
    """
    stream_manager = get_stream_manager()
    stream = await stream_manager.get_stream(execution_id)

    if not stream:
        raise HTTPException(
            status_code=404,
            detail=f'Stream not found: {execution_id}'
        )

    await require_stream_owner(request, stream.user_email)

    async def generate_events():
        """Generate SSE stream of events with 50-second window."""
        last_timestamp = body.last_event_timestamp or 0.0
        start_time = datetime.now()

        # Keep streaming until timeout or completion
        while True:
            # Get new events since last timestamp
            new_events, new_cursor = stream.get_events_since(last_timestamp)

            # Send new events
            for event in new_events:
                yield sse_event(event)

            # Update timestamp
            if new_events:
                last_timestamp = new_cursor

            # Check if stream is complete or cancelled
            if stream.is_complete or stream.is_cancelled:
                # Drain any events added between last poll and completion
                remaining, _ = stream.get_events_since(last_timestamp)
                for event in remaining:
                    if event.get('type') != 'stream.completed':
                        yield sse_event(event)
                yield sse_event({
                    'type': 'stream.completed',
                    'is_error': stream.error is not None,
                    'is_cancelled': stream.is_cancelled,
                })
                yield 'data: [DONE]\n\n'
                break

            # Check if we've exceeded the SSE window (50 seconds)
            elapsed = (datetime.now() - start_time).total_seconds()
            if elapsed > SSE_WINDOW_SECONDS:
                # Send reconnect signal with last timestamp
                yield sse_event({
                    'type': 'stream.reconnect',
                    'execution_id': execution_id,
                    'last_timestamp': last_timestamp,
                    'message': 'Reconnect to continue streaming',
                })
                break

            # Wait a bit before checking for new events
            await asyncio.sleep(0.1)

    return StreamingResponse(
        generate_events(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )


@router.post('/stop_stream/{execution_id}', response_model=StopStreamResponse)
async def stop_stream(request: Request, execution_id: str):
    """Stop/cancel an active stream.

    Args:
        execution_id: The execution ID from invoke_agent

    Returns:
        Success status and message
    """
    stream_manager = get_stream_manager()
    stream = await stream_manager.get_stream(execution_id)

    if not stream:
        raise HTTPException(
            status_code=404,
            detail=f'Stream not found: {execution_id}'
        )

    await require_stream_owner(request, stream.user_email)

    if stream.is_complete:
        return StopStreamResponse(
            success=False,
            message='Stream already complete'
        )

    cancelled = stream.cancel()

    return StopStreamResponse(
        success=cancelled,
        message='Stream cancelled' if cancelled else 'Failed to cancel stream'
    )


@router.get('/projects/{project_id}/files')
async def list_project_files(request: Request, project_id: str):
    """List files in a project directory."""
    # Validate ownership (UUID → 400, missing → 404) for parity with invoke_agent.
    await require_owned_project(request, project_id)

    # Get project directory and list files
    project_dir = get_project_directory(project_id)

    files = []
    for path in project_dir.rglob('*'):
        if path.is_file():
            rel_path = path.relative_to(project_dir)
            files.append(
                {
                    'path': str(rel_path),
                    'name': path.name,
                    'size': path.stat().st_size,
                    'modified': datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                }
            )

    return {'project_id': project_id, 'files': files}


@router.get('/projects/{project_id}/conversations/{conversation_id}/executions')
async def get_conversation_executions(
    request: Request,
    project_id: str,
    conversation_id: str,
):
    """Get active and recent executions for a conversation.

    Returns the current active execution (if any) and recent completed ones.
    This enables session independence - users can reconnect after navigating away.
    """
    from ..services.storage import ExecutionStorage

    # Validate ownership (UUID → 400, missing → 404) for parity with invoke_agent.
    user_email, _project = await require_owned_project(request, project_id)

    # First check in-memory streams for this conversation (always works)
    stream_manager = get_stream_manager()
    in_memory_active = None
    async with stream_manager._lock:
        for stream in stream_manager._streams.values():
            if (
                stream.conversation_id == conversation_id
                and not stream.is_complete
                and not stream.is_cancelled
            ):
                in_memory_active = {
                    'id': stream.execution_id,
                    'conversation_id': stream.conversation_id,
                    'project_id': stream.project_id,
                    'status': 'running',
                    'events': [e.data for e in stream.events],
                    'error': stream.error,
                    'created_at': None,
                }
                break

    # Try to get executions from database (may fail if table doesn't exist yet)
    active = None
    recent = []
    try:
        exec_storage = ExecutionStorage(user_email, project_id, conversation_id)
        active = await exec_storage.get_active()
        recent = await exec_storage.get_recent(limit=5)

        # After process restart, DB can still say "running" while the in-memory
        # stream is gone. Treat those as orphaned — never hand them to the
        # client as reconnectable (stream_progress would 404).
        if active is not None and in_memory_active is None:
            logger.warning(
                'Orphaned running execution %s for conversation %s; marking cancelled',
                active.id,
                conversation_id,
            )
            await exec_storage.update_status(
                active.id,
                'cancelled',
                error='Execution lost after process restart',
            )
            active = None
            recent = await exec_storage.get_recent(limit=5)
    except Exception as e:
        # Table might not exist yet (migration pending) - log and continue
        # In-memory streams will still work
        logger.warning(f'Failed to query executions table (may not exist yet): {e}')

    return {
        'active': (
            in_memory_active
            or (active.to_dict() if active else None)
        ),
        'recent': [e.to_dict() for e in recent if e.id != (
            active.id if active else None
        )],
    }
