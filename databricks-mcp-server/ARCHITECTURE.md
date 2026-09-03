# Databricks MCP Server — Architecture

> Illustrative overview of how the MCP client, server, and `databricks-tools-core` fit together. This diagram is a high-level sketch and may not enumerate every tool module.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              MCP Client (Claude Code / Cursor / …)          │
│                                                             │
│  MCP Tools (actions)                                        │
│  └── .mcp.json ──► databricks server                        │
└──────────────────────────────┬──────────────────────────────┘
                               │ MCP Protocol (stdio)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│              databricks-mcp-server (FastMCP)                │
│                                                             │
│  tools/sql.py ──────────────┐                               │
│  tools/compute.py ──────────┤                               │
│  tools/file.py ─────────────┤                               │
│  tools/jobs.py ─────────────┼──► @mcp.tool decorators       │
│  tools/pipelines.py ────────┤                               │
│  tools/agent_bricks.py ─────┤                               │
│  tools/aibi_dashboards.py ──┤                               │
│  tools/serving.py ──────────┘                               │
└──────────────────────────────┬──────────────────────────────┘
                               │ Python imports
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                   databricks-tools-core                     │
│                                                             │
│  sql/  compute/  jobs/  unity_catalog/  vector_search/      │
│  lakebase/  spark_declarative_pipelines/  serving/  …       │
└──────────────────────────────┬──────────────────────────────┘
                               │ Databricks SDK
                               ▼
                    ┌─────────────────────┐
                    │  Databricks         │
                    │  Workspace          │
                    └─────────────────────┘
```
