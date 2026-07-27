# Databricks Builder App

> **Security Notice:** This application wraps Claude Code. Projects created within the app by different users are not strongly isolated from each other (this project doesn't implement solutions like Firecracker microVM or Docker to isolate Claude sessions from the app). Only grant access to users you trust.

A web application that provides a Claude Code agent interface for building on
Databricks. Skills supply product-specific workflows; Claude executes those
workflows through the authenticated Databricks CLI or short Python SDK scripts.
The Builder App intentionally registers no MCP servers.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Web Application                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  React Frontend (client/)           FastAPI Backend (server/)               │
│  ┌─────────────────────┐            ┌─────────────────────────────────┐     │
│  │ Chat UI             │◄──────────►│ /api/invoke_agent               │     │
│  │ Project Selector    │   SSE      │ /api/projects                   │     │
│  │ Conversation List   │            │ /api/conversations              │     │
│  └─────────────────────┘            └─────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Claude Code Session                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Each user message spawns a Claude Code agent session via claude-agent-sdk  │
│                                                                              │
│  Built-in Tools:                       Skills:                              │
│  ┌──────────────────────────┐          ┌───────────────────────────────┐   │
│  │ Read, Write, Edit, Bash  │◄────────►│ CLI / Python SDK workflows    │   │
│  │ Glob, Grep, Skill        │          │ jobs, pipelines, SQL, UC ...  │   │
│  └──────────────────────────┘          └───────────────────────────────┘   │
│                 │                                                           │
│                 ▼                                                           │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ Project-scoped .databrickscfg → databricks CLI / WorkspaceClient    │  │
│  │ mcp_servers={} (local and deployed)                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                             │
                                             ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Databricks Workspace                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  SQL Warehouses    │    Clusters    │    Unity Catalog    │    Workspace    │
└─────────────────────────────────────────────────────────────────────────────┘
```

## How It Works

### 1. Claude Code Sessions

When a user sends a message, the backend creates a Claude Code session using the `claude-agent-sdk`:

```python
from claude_agent_sdk import ClaudeAgentOptions, query

options = ClaudeAgentOptions(
    cwd=str(project_dir),           # Project working directory
    allowed_tools=['Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Skill'],
    permission_mode='dontAsk',       # Enforce project-scoped file access
    resume=session_id,               # Resume previous conversation
    mcp_servers={},                  # Skills + CLI only
    system_prompt=system_prompt,     # Databricks-focused prompt
    setting_sources=['project'],     # Avoid inheriting host MCP settings
)

async for msg in query(prompt=message, options=options):
    yield msg  # Stream to frontend
```

Key features:
- **Session Resumption**: Each conversation stores a `claude_session_id` for context continuity
- **Streaming**: All events (text, thinking, tool_use, tool_result) stream to the frontend in real-time
- **Project Isolation**: Each project has its own working directory with sandboxed file access

### 2. Authentication Flow

The app supports multi-user authentication using per-request credentials:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Authentication Flow                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Production (Databricks Apps)         Development (Local)                   │
│  ┌──────────────────────────┐         ┌──────────────────────────┐          │
│  │ Request Headers:         │         │ Environment Variables:   │          │
│  │ X-Forwarded-User         │         │ DATABRICKS_HOST          │          │
│  │ X-Forwarded-Access-Token │         │ DATABRICKS_TOKEN         │          │
│  └────────────┬─────────────┘         └────────────┬─────────────┘          │
│               │                                    │                        │
│               └──────────────┬─────────────────────┘                        │
│                              ▼                                              │
│               ┌──────────────────────────┐                                  │
│               │ Project CLI auth         │                                  │
│               │ - .databrickscfg (0600)  │                                  │
│               │ - request user token     │                                  │
│               └────────────┬─────────────┘                                  │
│                            ▼                                                │
│               ┌──────────────────────────┐                                  │
│               │ Bash                     │                                  │
│               │ - databricks CLI         │                                  │
│               │ - Python WorkspaceClient │                                  │
│               └──────────────────────────┘                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. **Request arrives** - The FastAPI backend extracts credentials:
   - **Production**: `X-Forwarded-User` and `X-Forwarded-Access-Token` headers (set by Databricks Apps proxy)
   - **Development**: Falls back to `DATABRICKS_HOST` and `DATABRICKS_TOKEN` env vars

2. **Project CLI profile written** - Before invoking Claude, the backend writes
   `<project>/.databrickscfg` with mode `0600` and points unified auth at it with
   `DATABRICKS_CONFIG_FILE`, `DATABRICKS_CONFIG_PROFILE=DEFAULT`, and
   `DATABRICKS_AUTH_TYPE=pat`.

3. **CLI / SDK uses the request identity** - `databricks` commands and
   `WorkspaceClient()` inherit the same project-scoped environment. On Apps,
   inherited service-principal variables are cleared so unified auth cannot
   select the app identity ahead of the forwarded user token. If Apps omit
   `X-Forwarded-Access-Token`, `invoke_agent` fails closed with **401** rather
   than falling back to the FMAPI token or ambient app SP. Cross-workspace
   calls must provide both `target_databricks_host` and `target_databricks_token`.

This ensures each user's requests use their own Databricks credentials, enabling proper access control and audit logging.

### 3. Skills + Databricks CLI

The agent runs **without** MCP servers. Project skills provide product-specific
Databricks CLI and Python SDK workflows:

```python
options = ClaudeAgentOptions(
    mcp_servers={},
    allowed_tools=['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash', 'Skill'],
)
```

Each request writes a project-scoped `.databrickscfg` (excluded from backups)
and points the Claude subprocess at it. In Databricks Apps this uses the
proxy-forwarded user token and scrubs inherited service-principal credentials.

### 4. Skills System

Skills provide specialized guidance for Databricks development tasks. They are markdown files with instructions and examples that Claude can load on demand.

**Skill loading flow:**
1. `scripts/install_builder_skills.sh` installs skills via `databricks aitools` + MLflow fetch into `.claude/skills/`
2. On startup, skills are merged into `./skills/`
3. When a project is created, skills are copied to `project/.claude/skills/`
4. The agent can invoke skills using the `Skill` tool: `skill: "databricks-pipelines"`

Skills include (from [databricks-agent-skills](https://github.com/databricks/databricks-agent-skills)):
- **databricks-dabs**: DABs configuration
- **databricks-apps-python**: Python apps with Dash, Streamlit, Flask
- **databricks-python-sdk**: Python SDK patterns
- **databricks-mlflow-evaluation**: MLflow evaluation and trace analysis
- **databricks-pipelines**: Spark Declarative Pipelines (SDP) development
- **databricks-synthetic-data-gen**: Creating test datasets

### 5. Project Persistence

Projects are stored in the local filesystem with automatic backup to PostgreSQL:

```
projects/
  <project-uuid>/
    .claude/
      skills/        # Copied skills for this project
    src/             # User's code files
    ...
```

**Backup system:**
- After each agent interaction, the project is marked for backup
- A background worker runs every 10 minutes
- Projects are zipped and stored in PostgreSQL (Lakebase)
- On access, missing projects are restored from backup

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- [uv](https://github.com/astral-sh/uv) package manager
- [Databricks CLI v1.0.0+](https://docs.databricks.com/aws/en/dev-tools/cli/install) (for `databricks aitools` skills install)
- Databricks workspace with:
  - SQL warehouse (for SQL queries)
  - Cluster (for Python/PySpark execution)
  - Unity Catalog enabled (recommended)
- PostgreSQL database (Lakebase) for project persistence — autoscale or provisioned

### Quick Start (Local Development)

One command provisions Lakebase, installs all dependencies, and starts the app:

```bash
cd databricks-builder-app
./scripts/start_local.sh --profile <your-profile>
```

This will:
- Check prerequisites (uv, Node.js, npm, Databricks CLI v0.287.0+)
- Get credentials from your Databricks CLI profile
- Provision a Lakebase Autoscale database via DAB (if needed)
- Generate `.env.local` with your workspace settings
- Install backend and frontend dependencies
- Install all Databricks + MLflow skills via `install_builder_skills.sh` (requires CLI v1.0.0+)
- Test the Lakebase connection
- Start backend (http://localhost:8000) and frontend (http://localhost:3000)

#### Options

```bash
# First time — everything from scratch
./scripts/start_local.sh --profile dbx_shared_demo

# Subsequent runs — fast (deps cached, Lakebase exists)
./scripts/start_local.sh --profile dbx_shared_demo

# Skip Lakebase provisioning
./scripts/start_local.sh --profile dbx_shared_demo --skip-lakebase

# Force reinstall all dependencies
./scripts/start_local.sh --profile dbx_shared_demo --force-install

# Regenerate .env.local
./scripts/start_local.sh --profile dbx_shared_demo --force-env

# Custom Lakebase project name
./scripts/start_local.sh --profile dbx_shared_demo --lakebase-id my-custom-db
```

#### Access the App

- **Frontend**: <http://localhost:3000>
- **Backend API**: <http://localhost:8000>
- **API Docs**: <http://localhost:8000/docs>

Press `Ctrl+C` to stop both servers.

#### (Optional) Configure Claude via Databricks Model Serving

If you're routing Claude API calls through Databricks Model Serving instead of directly to Anthropic, create `.claude/settings.json` in the **repository root** (not in the app directory):

```json
{
    "env": {
        "ANTHROPIC_MODEL": "databricks-claude-sonnet-4-5",
        "ANTHROPIC_BASE_URL": "https://your-workspace.cloud.databricks.com/serving-endpoints/anthropic",
        "ANTHROPIC_AUTH_TOKEN": "dapi...",
        "ANTHROPIC_DEFAULT_OPUS_MODEL": "databricks-claude-opus-4-5",
        "ANTHROPIC_DEFAULT_SONNET_MODEL": "databricks-claude-sonnet-4-5"
    }
}
```

Notes:

- `ANTHROPIC_AUTH_TOKEN` should be a Databricks PAT, not an Anthropic API key
- `ANTHROPIC_BASE_URL` should point to your Databricks Model Serving endpoint
- If this file doesn't exist, the app uses your `ANTHROPIC_API_KEY` from `.env.local`

### Configuration Details

#### Databricks Authentication Modes

The app supports two authentication modes:

**1. Local Development (Environment Variables)**
- Uses `DATABRICKS_HOST` and `DATABRICKS_TOKEN` from `.env.local`
- All users share the same credentials
- Good for local development and testing

**2. Production (Request Headers)**
- Uses `X-Forwarded-User` and `X-Forwarded-Access-Token` headers
- Set automatically by Databricks Apps proxy
- Each user has their own credentials
- Proper multi-user isolation

#### Skills Configuration

Skills are installed by `scripts/install_builder_skills.sh` (via `databricks aitools` + MLflow fetch) and filtered by the `ENABLED_SKILLS` environment variable:

- `databricks-python-sdk`: Patterns for using the Databricks Python SDK
- `databricks-pipelines`: SDP/DLT pipeline development
- `databricks-synthetic-data-gen`: Creating test datasets
- `databricks-apps-python`: Python apps with Dash, Streamlit, Flask

**Refreshing skills:**
```bash
./scripts/install_builder_skills.sh --profile <your-profile>
```

New upstream skills are published to [databricks-agent-skills](https://github.com/databricks/databricks-agent-skills); re-run the installer or use `databricks aitools update` to refresh.

#### Database Setup

The app uses PostgreSQL (Lakebase) for:
- Project metadata
- Conversation history
- Message storage
- Project backups (zipped project files)

**Migrations:**
```bash
# Run migrations (done automatically on startup)
alembic upgrade head

# Create a new migration
alembic revision --autogenerate -m "description"
```

### Troubleshooting

#### Agent does not execute Databricks commands

Check:
1. The relevant skill is enabled and present under the project `.claude/skills/`.
2. `databricks -v` succeeds in the Builder App environment.
3. `<project>/.databrickscfg` exists with mode `0600`.
4. The streamed tool events show `Skill` and `Bash`, never
   `mcp__databricks__*`.

The app still carries a fresh-event-loop workaround for an older
`claude-agent-sdk` streaming issue; see [EVENT_LOOP_FIX.md](./EVENT_LOOP_FIX.md)
for historical context.

#### Skills not loading

Check:
1. `ENABLED_SKILLS` environment variable in `.env.local` (empty = all installed skills)
2. Skill names match directories under `.claude/skills/` or `./skills/`
3. Each skill has a `SKILL.md` file with proper frontmatter
4. Run `./scripts/install_builder_skills.sh` if skills are missing
5. Check logs: `Copied X skills to ./skills`

#### Databricks authentication failing

Check:
1. `DATABRICKS_HOST` is correct (no trailing slash)
2. `DATABRICKS_TOKEN` is valid and not expired
3. Token has proper permissions (cluster access, SQL warehouse access, etc.)
4. If using Databricks Model Serving, check `.claude/settings.json` configuration

#### Port already in use

```bash
# Kill processes on ports 8000 and 3000
lsof -ti:8000 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```

### Production Build

```bash
# Build frontend
cd client && npm run build && cd ..

# Run with uvicorn
uvicorn server.app:app --host 0.0.0.0 --port 8000
```

## Project Structure

```
databricks-builder-app/
├── server/                 # FastAPI backend
│   ├── app.py             # Main FastAPI app
│   ├── db/                # Database models and migrations
│   │   ├── models.py      # SQLAlchemy models
│   │   └── database.py    # Session management
│   ├── routers/           # API endpoints
│   │   ├── agent.py       # /api/agent/* (invoke, etc.)
│   │   ├── projects.py    # /api/projects/*
│   │   └── conversations.py
│   └── services/          # Business logic
│       ├── agent.py       # Claude Code session management
│       ├── cli_auth.py    # Project-scoped Databricks CLI authentication
│       ├── user.py        # User auth (headers/env vars)
│       ├── skills_manager.py
│       ├── backup_manager.py
│       └── system_prompt.py
├── packages/              # Vendored databricks_tools_core auth helpers
├── client/                # React frontend
│   ├── src/
│   │   ├── pages/         # Main pages (ProjectPage, etc.)
│   │   └── components/    # UI components
│   └── package.json
├── alembic/               # Database migrations
├── scripts/               # Utility scripts
│   ├── start_local.sh     # Local development (one command)
│   └── install_builder_skills.sh  # Skills via databricks aitools + MLflow
├── skills/                # Cached skills (gitignored)
├── projects/              # Project working directories (gitignored)
├── pyproject.toml         # Python dependencies
└── .env.example           # Environment template
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/me` | GET | Get current user info |
| `/api/health` | GET | Health check |
| `/api/system_prompt` | GET | Preview the system prompt |
| `/api/projects` | GET | List all projects |
| `/api/projects` | POST | Create new project |
| `/api/projects/{id}` | GET | Get project details |
| `/api/projects/{id}` | PATCH | Update project name |
| `/api/projects/{id}` | DELETE | Delete project |
| `/api/projects/{id}/conversations` | GET | List project conversations |
| `/api/projects/{id}/conversations` | POST | Create new conversation |
| `/api/projects/{id}/conversations/{cid}` | GET | Get conversation with messages |
| `/api/projects/{id}/files` | GET | List files in project directory |
| `/api/invoke_agent` | POST | Start agent execution (returns execution_id) |
| `/api/stream_progress/{execution_id}` | POST | SSE stream of agent events |
| `/api/stop_stream/{execution_id}` | POST | Cancel an active execution |
| `/api/projects/{id}/skills/available` | GET | List skills with enabled status |
| `/api/projects/{id}/skills/enabled` | PUT | Update enabled skills for project |
| `/api/projects/{id}/skills/reload` | POST | Reload skills from source |
| `/api/projects/{id}/skills/tree` | GET | Get skills file tree |
| `/api/projects/{id}/skills/file` | GET | Get skill file content |
| `/api/clusters` | GET | List available Databricks clusters |
| `/api/warehouses` | GET | List available SQL warehouses |
| `/api/mlflow/status` | GET | Get MLflow tracing status |

## Deploying to Databricks Apps

The Builder App uses an automated deploy script that provisions all infrastructure and deploys the app in a single command.

### Prerequisites

- **Databricks CLI v0.287.0+** — [Install](https://docs.databricks.com/aws/en/dev-tools/cli/install)
- **Node.js 18+** — for building the frontend
- **uv** — Python package manager ([Install](https://github.com/astral-sh/uv))
- **Databricks workspace** with Lakebase Autoscaling enabled

### Quick Deploy

```bash
cd databricks-builder-app

# Full deploy — creates Lakebase, builds frontend, installs skills, creates app, grants permissions, deploys
./scripts/deploy.sh <app-name> --profile <your-profile>
```

That's it. The script handles everything:

| Step | What the script does |
|------|---------------------|
| 1 | Checks prerequisites (CLI version, auth) |
| 2 | Provisions Lakebase Autoscale via Databricks Asset Bundle (`databricks.yml`) |
| 3 | Builds the React frontend |
| 4 | Stages server code, packages, skills, and generates `app.yaml` |
| 5 | Creates the Databricks App (if it doesn't exist) |
| 6 | Creates Lakebase OAuth role and grants PostgreSQL permissions for the app's service principal |
| 7 | Uploads everything to workspace |
| 8 | Deploys the app |

### Deploy Options

```bash
# Full deploy from scratch
./scripts/deploy.sh my-builder-app --profile dbx_shared_demo

# Quick redeploy (skip Lakebase + frontend build + skills download)
./scripts/deploy.sh my-builder-app --profile dbx_shared_demo --skip-lakebase --skip-build --skip-skills

# Custom Lakebase project name
./scripts/deploy.sh my-builder-app --profile dbx_shared_demo --lakebase-id my-custom-db

# All options
./scripts/deploy.sh --help
```

### What Gets Created

| Resource | Details |
|----------|---------|
| **Lakebase Autoscale project** | PostgreSQL 17, 0.5-2 CU, scale-to-zero after 5 min |
| **Databricks App** | FastAPI backend + React frontend |
| **Lakebase OAuth role** | For the app's service principal |
| **PostgreSQL schema** | `builder_app` with full grants for the SP |
| **Database tables** | Created automatically via alembic migrations on first startup |

### Infrastructure as Code

The Lakebase database is managed declaratively via a Databricks Asset Bundle (`databricks.yml`):

```yaml
bundle:
  name: databricks-builder-app

variables:
  lakebase_project_id:
    description: "Lakebase project ID"
    default: "builder-app-db"

resources:
  postgres_projects:
    builder_db:
      project_id: ${var.lakebase_project_id}
      display_name: "builder-app-db"
      pg_version: 17
      default_endpoint_settings:
        autoscaling_limit_min_cu: 0.5
        autoscaling_limit_max_cu: 2
        suspend_timeout_duration: "300s"
```

You can manage the Lakebase infrastructure independently:

```bash
# Deploy/update Lakebase only
databricks bundle deploy --profile <profile>

# Destroy Lakebase (does NOT affect the app)
databricks bundle destroy --profile <profile>
```

### Redeploying After Code Changes

```bash
# Full redeploy (rebuilds everything)
./scripts/deploy.sh my-builder-app --profile <profile>

# Quick redeploy (server code changes only)
./scripts/deploy.sh my-builder-app --profile <profile> --skip-lakebase --skip-build --skip-skills
```

### Destroying Everything

```bash
# Delete the app
databricks apps delete my-builder-app --profile <profile>

# Delete the Lakebase database
databricks bundle destroy --profile <profile> --auto-approve
```

### MLflow Tracing

The app automatically traces Claude Code conversations to MLflow. Traces include user prompts, Claude responses, tool usage, and session metadata.

The deploy script configures tracing to the `/Workspace/Shared/builder_app_ml_trace` experiment by default. To customize, edit the `MLFLOW_EXPERIMENT_NAME` value in the generated `app.yaml` section of `scripts/deploy.sh`.

See the [Databricks MLflow Tracing documentation](https://docs.databricks.com/aws/en/mlflow3/genai/tracing/integrations/claude-code) for more details.

### Deployment Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| CLI version too old | Need v0.287.0+ for Lakebase DAB support | `curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh \| sh` |
| `project with such id already exists` | Lakebase project name conflict | Use `--lakebase-id <different-name>` or destroy existing: `databricks bundle destroy` |
| `password authentication failed` | Lakebase OAuth role not created | Re-run deploy — Step 6 handles this automatically |
| `permission denied for table` | PostgreSQL grants missing | Re-run deploy — Step 6 is idempotent |
| `relation does not exist` | Migrations didn't run | Redeploy the app to trigger migrations |
| App shows blank page | Check logs: `databricks apps logs <app-name>` | Usually a package install error — check requirements.txt |
| Deploy exits despite Apps UI looking fine | Status parse / id mismatch | Deploy requires `--output json` SUCCEEDED for **this** deployment id; check script output |
| `MLflow skills incomplete: N/8` | GitHub fetch of mlflow/skills partially failed | Retry, set `MLFLOW_REF=<ref>`, or `ALLOW_PARTIAL_MLFLOW_SKILLS=1` to accept a short set |
| `Could not parse 'databricks aitools list'` | CLI inventory output format changed | Upgrade/downgrade the CLI, or `ALLOW_STALE_AGENT_SKILLS=1` to install the offline snapshot |
| `401` / no workspace access token | Apps omitted `X-Forwarded-Access-Token` | Fail-closed by design — do not run CLI as the app SP; fix Apps auth headers |

## Embedding in Other Apps

If you want to embed the Databricks agent into your own application, see the integration example at:

```
scripts/_integration-example/
```

This provides a minimal working example with setup instructions for integrating the agent services into external frameworks.

## Related Packages

The builder app vendors **databricks_tools_core** under `packages/` for shared
Databricks authentication and identity helpers. Agent resource operations are
performed through skills and the authenticated Databricks CLI / Python SDK.

Skills are installed from [databricks-agent-skills](https://github.com/databricks/databricks-agent-skills) via `databricks aitools` (see `scripts/install_builder_skills.sh`).
