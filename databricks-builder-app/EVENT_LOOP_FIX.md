# Event Loop Fix for claude-agent-sdk Issue #462 ✅ RESOLVED

> **Historical note:** This workaround remains relevant to Claude Agent SDK
> streaming in FastAPI, but the Builder App no longer registers Databricks MCP
> tools. Current Databricks operations use project skills plus the Databricks
> CLI / Python SDK through `Bash`.

## Status: ✅ **WORKING - Production Ready**

This document describes the complete fix for claude-agent-sdk issue #462, which has been successfully implemented and tested.

## Problem

The `claude-agent-sdk` has a critical bug ([#462](https://github.com/anthropics/claude-agent-sdk-python/issues/462)) where the subprocess transport fails in FastAPI/uvicorn contexts. Symptoms include:

1. **Only returns init message**: The SDK only returns the initial `SystemMessage` and terminates
2. **Tools don't execute**: Agent cannot complete built-in tool calls
3. **Subprocess hangs**: The subprocess starts but Python never receives more stdout

This makes the SDK unusable in typical FastAPI deployments with middleware, logging, and other production patterns.

## Root Causes

### Issue 1: Event Loop Pollution
When `claude-agent-sdk` runs in a FastAPI/uvicorn context, the existing event loop interferes with the subprocess transport's `anyio.TextReceiveStream`, preventing it from receiving all subprocess output.

### Issue 2: Context Variable Loss (historical tool path)
Python's `contextvars` do not automatically propagate to new threads. The
original in-process tool implementation copied the request auth context into
the fresh event-loop thread. Current CLI-only execution instead receives a
project-scoped Databricks auth environment before Claude starts.

## Solution

We implemented a three-part fix:

### Part 1: Fresh Event Loop in Separate Thread
Run the Claude agent in a completely fresh event loop in a separate thread (in `server/services/agent.py`):

```python
def _run_agent_in_fresh_loop(message, options, result_queue, context):
  """Run agent in a fresh event loop (workaround for issue #462)."""
  def run_with_context():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    async def run_query():
      async def prompt_generator():
        yield {'type': 'user', 'message': {'role': 'user', 'content': message}}
      
      try:
        async for msg in query(prompt=prompt_generator(), options=options):
          result_queue.put(('message', msg))
      except Exception as e:
        result_queue.put(('error', e))
      finally:
        result_queue.put(('done', None))
    
    try:
      loop.run_until_complete(run_query())
    finally:
      loop.close()
  
  # Execute in the copied context
  context.run(run_with_context)
```

### Part 2: Context Propagation
Copy the `contextvars` context before spawning the thread (in
`server/services/agent.py`). This remains useful for request and tracing state:

```python
from contextvars import copy_context

# In stream_agent_response():
# Set auth context for this request
set_databricks_auth(databricks_host, databricks_token)

try:
  # ... setup options ...
  
  # Copy context BEFORE spawning thread
  ctx = copy_context()
  result_queue = queue.Queue()
  
  agent_thread = threading.Thread(
    target=_run_agent_in_fresh_loop,
    args=(message, options, result_queue, ctx),  # Pass context
    daemon=True
  )
  agent_thread.start()
  
  # Process messages from queue
  while True:
    msg_type, msg = await asyncio.get_event_loop().run_in_executor(
      None, result_queue.get
    )
    if msg_type == 'done':
      break
    elif msg_type == 'error':
      raise msg
    elif msg_type == 'message':
      # Yield message to frontend...

## How It Works

1. **Main Thread (FastAPI)**: Runs the FastAPI/uvicorn event loop
2. **Agent Thread**: Creates a fresh, isolated event loop for the Claude agent
3. **Context Copy**: Copies request `contextvars` state to the new thread
4. **Queue Communication**: Uses thread-safe queue to pass messages back to main thread
5. **Async Bridge**: Main thread reads from queue asynchronously using `run_in_executor`

## Benefits

✅ **Fixes subprocess transport**: Fresh event loop isolates agent from FastAPI's event loop  
✅ **Preserves request state**: Context copy propagates request context to the new thread
✅ **Maintains streaming**: Queue-based communication streams all messages properly  
✅ **Production-ready**: Works with middleware, logging, Sentry, and other FastAPI patterns  
✅ **Built-in tools work**: Skill, Bash, and file tool events stream successfully

## Testing

To verify the fix works:

1. Start the development server: `bash scripts/start_dev.sh`
2. Open the app at http://localhost:3000
3. Ask the agent to execute Databricks commands
4. Verify tools execute (check logs for successful Databricks API calls)

## References

- Original Issue: https://github.com/anthropics/claude-agent-sdk-python/issues/462
- Python contextvars: https://docs.python.org/3/library/contextvars.html
- Threading and contextvars: https://peps.python.org/pep-0567/#implementation-notes

