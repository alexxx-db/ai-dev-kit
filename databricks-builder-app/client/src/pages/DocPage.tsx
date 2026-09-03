import React, { useState } from 'react';
import {
  Home,
  Database,
  Server,
  BookOpen,
  Layers,
  Code,
  Cpu,
  ArrowRight,
  ChevronRight,
  Terminal,
  Sparkles,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';

type DocSection = 'overview' | 'app';

interface NavItem {
  id: DocSection;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: <Home className="h-4 w-4" /> },
  { id: 'app', label: 'Builder App', icon: <Sparkles className="h-4 w-4" /> },
];

function OverviewSection() {
  return (
    <div className="space-y-10 sm:space-y-12 [&_code]:break-words [&_code]:rounded [&_code]:border [&_code]:border-[var(--color-code-border)] [&_code]:bg-[var(--color-code-bg)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-[var(--color-text-primary)]">
      <div className="max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-primary)]">
          Documentation
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text-heading)] sm:text-4xl">
          Databricks AI Dev Kit
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
          Build Databricks projects with AI coding assistants, skills, and the Databricks CLI
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <h2 className="mb-3 text-xl font-semibold tracking-tight text-[var(--color-text-heading)]">
          What is the AI Dev Kit?
        </h2>
        <p className="max-w-3xl leading-7 text-[var(--color-text-secondary)]">
          The AI Dev Kit provides everything you need to build on Databricks using AI assistants like Claude Code, Cursor, and more:
        </p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          <li className="flex items-start gap-3">
            <BookOpen className="h-5 w-5 text-[var(--color-accent-primary)] mt-0.5 flex-shrink-0" />
            <span><code className="font-mono text-sm bg-[var(--color-background)] px-1.5 py-0.5 rounded">databricks-agent-skills</code> (via <code className="font-mono text-sm bg-[var(--color-background)] px-1.5 py-0.5 rounded">databricks aitools</code>) - Teach AI assistants supported CLI and Python SDK workflows</span>
          </li>
          <li className="flex items-start gap-3">
            <Database className="h-5 w-5 text-[var(--color-accent-primary)] mt-0.5 flex-shrink-0" />
            <span><code className="font-mono text-sm bg-[var(--color-background)] px-1.5 py-0.5 rounded">databricks CLI</code> - Executes SQL, jobs, pipelines, Unity Catalog, workspace, and other Databricks operations</span>
          </li>
          <li className="flex items-start gap-3">
            <Server className="h-5 w-5 text-[var(--color-accent-primary)] mt-0.5 flex-shrink-0" />
            <span><code className="font-mono text-sm bg-[var(--color-background)] px-1.5 py-0.5 rounded">Python SDK</code> - Provides a fallback for operations the CLI does not expose directly</span>
          </li>
          <li className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-[var(--color-accent-primary)] mt-0.5 flex-shrink-0" />
            <span><code className="font-mono text-sm bg-[var(--color-background)] px-1.5 py-0.5 rounded">databricks-builder-app/</code> - Claude Code in a web UI to deploy Databricks resources</span>
          </li>
        </ul>
      </div>

      {/* Visual Architecture */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--color-text-heading)]">
          How It Works
        </h2>
        <div className="space-y-4">
          {/* Outer wrapper: ai-dev-kit */}
          <div className="rounded-[var(--radius-xl)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <Layers className="h-5 w-5 text-[var(--color-text-heading)]" />
              <h3 className="font-mono font-semibold text-[var(--color-text-heading)]">ai-dev-kit/</h3>
            </div>

            {/* Skills and authenticated CLI execution */}
            <div className="grid gap-4 md:grid-cols-2">
              {/* Skills Layer - Left */}
              <div className="h-fit min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <BookOpen className="h-5 w-5 text-[var(--color-accent-primary)]" />
                  <h3 className="break-all font-mono font-semibold text-[var(--color-text-heading)]">databricks-agent-skills/</h3>
                  <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">Knowledge</span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] mb-3">
                  Installed via <code className="font-mono text-xs">databricks aitools</code>. Skills explain <em>how</em> to complete workflows with the CLI or Python SDK.
                </p>
                <div className="flex flex-wrap gap-2">
                  {['databricks-dabs/', 'databricks-apps-python/', 'databricks-python-sdk/', 'databricks-mlflow-evaluation/', 'databricks-pipelines/', 'databricks-synthetic-data-gen/'].map((skill) => (
                    <span key={skill} className="rounded border border-[var(--color-code-border)] bg-[var(--color-code-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text-secondary)]">
                      {skill}
                    </span>
                  ))}
                </div>
              </div>

              {/* CLI execution - Right */}
              <div className="min-w-0 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <Terminal className="h-5 w-5 text-[var(--color-success)]" />
                  <h3 className="font-mono font-semibold text-[var(--color-text-heading)]">Skill → Bash → Databricks</h3>
                  <span className="rounded-full border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-2 py-0.5 text-xs font-medium text-[var(--color-success)]">CLI only</span>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] mb-3">
                  Claude loads a product skill, then runs its authenticated Databricks CLI commands or Python SDK scripts through Bash.
                </p>

                {/* Auth layer */}
                <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Database className="h-5 w-5 text-[var(--color-accent-primary)]" />
                    <h3 className="font-semibold text-[var(--color-text-heading)] font-mono">Project-scoped auth</h3>
                    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-secondary)]">Per user</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['.databrickscfg (0600)', 'request token', 'databricks CLI', 'WorkspaceClient()', 'mcp_servers={}'].map((module) => (
                      <span key={module} className="rounded border border-[var(--color-code-border)] bg-[var(--color-code-bg)] px-2 py-1 font-mono text-xs text-[var(--color-text-secondary)]">
                        {module}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-6 w-6 text-[var(--color-text-muted)] rotate-90" />
          </div>

          {/* Consumers */}
          <div className="grid gap-4 md:grid-cols-2">
            {/* AI Tools (Claude Code, Cursor, etc.) */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="h-5 w-5 text-[var(--color-info)]" />
                <h3 className="font-semibold text-[var(--color-text-heading)]">AI Coding Tools</h3>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mb-3">
                Supercharge your coding AI tools with Databricks capabilities
              </p>
              <div className="flex flex-wrap gap-2">
                {['Cursor', 'Claude Code', 'Windsurf', 'Custom Agents'].map((tool) => (
                  <span key={tool} className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            {/* Builder App */}
            <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-5 w-5 text-[var(--color-accent-primary)]" />
                <h3 className="break-all font-mono font-semibold text-[var(--color-text-heading)]">databricks-builder-app/</h3>
              </div>
              <p className="text-sm text-[var(--color-text-muted)] mb-3">
                Claude Code in a UI - an agent to work on and deploy Databricks resources
              </p>
              <div className="flex flex-wrap gap-2">
                {['Web UI', 'Project Management', 'Deploy Resources', 'Conversation History'].map((feature) => (
                  <span key={feature} className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-text-secondary)]">
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Example Workflow */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-heading)] mb-4">
          Example: Generate Synthetic Data
        </h2>
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-6">
          <div className="space-y-4">
            {/* User Request */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-accent-primary)]/20 flex items-center justify-center">
                <span className="text-sm font-medium text-[var(--color-accent-primary)]">1</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">User Request</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  "Generate synthetic customer support data with realistic patterns"
                </p>
              </div>
            </div>

            {/* Read Skill */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-accent-primary)]/20 flex items-center justify-center">
                <span className="text-sm font-medium text-[var(--color-accent-primary)]">2</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">Read Skill</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Claude reads <code className="px-1 py-0.5 rounded bg-[var(--color-background)] text-xs">databricks-synthetic-data-gen/</code> skill to learn best practices
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {['Non-linear distributions', 'Referential integrity', 'Time patterns', 'Row coherence'].map((item) => (
                    <span key={item} className="text-xs px-2 py-1 rounded bg-[var(--color-accent-primary)]/10 text-[var(--color-text-secondary)]">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Understand Storage */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--color-accent-primary)]/20 flex items-center justify-center">
                <span className="text-sm font-medium text-[var(--color-accent-primary)]">3</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">Understand how to write and store raw data on Databricks UC</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Learn from skill: save raw files to Volume, create catalog/schema/volume in script, ask user for schema name, install libraries on cluster
                </p>
              </div>
            </div>

            {/* Write Code */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/10">
                <span className="text-sm font-medium text-[var(--color-success)]">4</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">Write Python Locally</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Create <code className="px-1 py-0.5 rounded bg-[var(--color-background)] text-xs">scripts/generate_data.py</code> with Faker, pandas, realistic distributions
                </p>
              </div>
            </div>

            {/* Execute Remote */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-success)]/10">
                <span className="text-sm font-medium text-[var(--color-success)]">5</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">Execute on Databricks</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Follow the skill&apos;s CLI or Python SDK workflow to upload and run the script on the selected Databricks compute
                </p>
              </div>
            </div>

            {/* Handle Errors */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-warning)]/10">
                <span className="text-sm font-medium text-[var(--color-warning)]">6</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">Fix & Retry</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Inspect CLI output, edit the local source, rerun the documented command, and verify the resulting Databricks resource
                </p>
              </div>
            </div>

            {/* Validate */}
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-info)]/10">
                <span className="text-sm font-medium text-[var(--color-info)]">7</span>
              </div>
              <div className="min-w-0">
                <p className="font-medium text-[var(--color-text-heading)]">Validate Results</p>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Call <code className="px-1 py-0.5 rounded bg-[var(--color-background)] text-xs">get_volume_folder_details()</code> to verify written files - schema, row counts, column stats
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Why It Works */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-heading)] mb-4">
          Why It Works
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <BookOpen className="h-5 w-5 text-[var(--color-accent-primary)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">Skills teach latest features</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              AI learns Databricks best practices through curated skills - no outdated patterns or deprecated APIs.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <Code className="h-5 w-5 text-[var(--color-success)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">Battle-tested abstractions</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              High-level tools like "run this file" hide 2000+ lines of tested code with caching, retries, and optimizations.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <Cpu className="h-5 w-5 text-[var(--color-info)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">Faster execution</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Bundled operations reduce LLM reasoning steps - no assembling dozens of API calls, just a few high-level tools.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <Database className="h-5 w-5 text-[var(--color-warning)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">No hallucination</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              CLI commands return real output and errors, and the agent verifies resource state before claiming success.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <ArrowRight className="h-5 w-5 text-[var(--color-accent-primary)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">Built-in feedback loops</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Skills teach validation and recovery patterns. CLI output gives the agent a concrete feedback loop.
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="h-5 w-5 text-[var(--color-success)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">Fully decoupled</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Skills remain portable instructions while the Builder App keeps execution simple with standard CLI and SDK interfaces.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppSection() {
  return (
    <div className="space-y-10 sm:space-y-12 [&_code]:break-words [&_code]:rounded [&_code]:border [&_code]:border-[var(--color-code-border)] [&_code]:bg-[var(--color-code-bg)] [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-[var(--color-text-primary)]">
      <div className="max-w-3xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-primary)]">
          Builder App
        </p>
        <h1 className="break-words text-3xl font-bold tracking-tight text-[var(--color-text-heading)] sm:text-4xl">
          databricks-builder-app
        </h1>
        <p className="mt-3 text-base leading-7 text-[var(--color-text-secondary)] sm:text-lg">
          Claude Code in a web UI - an agent to work on and deploy Databricks resources
        </p>
      </div>

      <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
        <p className="max-w-3xl leading-7 text-[var(--color-text-secondary)]">
          You're using it right now! This application provides a web interface for interacting with Claude
          and authenticated Databricks CLI workflows, with project-based organization and conversation history.
        </p>
      </div>

      {/* Architecture Diagram */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--color-text-heading)]">
          Architecture
        </h2>
        <div className="space-y-4 rounded-[var(--radius-xl)] border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-6">
          {/* React Frontend - Top */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="flex items-center gap-2 mb-2">
              <Code className="h-5 w-5 text-[var(--color-accent-primary)]" />
              <h3 className="font-semibold text-[var(--color-text-heading)]">React Frontend</h3>
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              Chat UI, project management, resource configuration, file browser
            </p>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <ArrowRight className="h-6 w-6 text-[var(--color-text-muted)] rotate-90" />
          </div>

          {/* Backend + PostgreSQL side by side */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* FastAPI Backend - 2 cols */}
            <div className="md:col-span-2 space-y-4">
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Server className="h-5 w-5 text-[var(--color-success)]" />
                  <h3 className="font-semibold text-[var(--color-text-heading)]">FastAPI Backend</h3>
                </div>
                <p className="text-sm text-[var(--color-text-muted)]">
                  Claude Agent SDK, skills, CLI authentication, file management
                </p>
              </div>

              {/* Arrow */}
              <div className="flex justify-center">
                <ArrowRight className="h-6 w-6 text-[var(--color-text-muted)] rotate-90" />
              </div>

              {/* Claude Code Session */}
              <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="mb-2 flex items-start gap-2">
                  <Terminal className="mt-0.5 h-5 w-5 flex-shrink-0 text-[var(--color-info)]" />
                  <h3 className="font-semibold text-[var(--color-text-heading)]">Create Claude Code session through the SDK</h3>
                </div>
                <p className="text-sm text-[var(--color-text-muted)] mb-3">
                  Claude Code reads/writes files locally in the app folder <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">project/&lt;project_id&gt;/</code>
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mb-3">
                  When starting a new project, we load skills and provide project-scoped built-in tools:
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-sm)]">
                    <div className="flex items-center gap-2 mb-2">
                      <BookOpen className="h-4 w-4 text-[var(--color-accent-primary)]" />
                      <span className="font-semibold text-sm text-[var(--color-text-heading)]">Skills</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Product workflows, validation, CLI and SDK guidance
                    </p>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 shadow-[var(--shadow-sm)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Cpu className="h-4 w-4 text-[var(--color-success)]" />
                      <span className="font-semibold text-sm text-[var(--color-text-heading)]">Execution</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Bash runs the Databricks CLI or Python SDK scripts
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* PostgreSQL - 1 col on the right */}
            <div className="h-fit rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-5 w-5 text-[var(--color-warning)]" />
                <h3 className="font-semibold text-[var(--color-text-heading)]">PostgreSQL</h3>
              </div>
              <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
                <li className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-[var(--color-warning)]" />
                  Save conversations
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-[var(--color-warning)]" />
                  Claude Code session
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-[var(--color-warning)]" />
                  Backup project files
                </li>
                <li className="flex items-center gap-2">
                  <ChevronRight className="h-3 w-3 text-[var(--color-warning)]" />
                  Project details/resources
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works - Key Concepts */}
      <div>
        <h2 className="mb-4 text-xl font-semibold tracking-tight text-[var(--color-text-heading)]">
          How It Works
        </h2>
        <div className="space-y-4">
          {/* Project Creation */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-accent-primary)]/20 flex items-center justify-center text-[var(--color-accent-primary)] font-semibold text-sm">1</div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-text-heading)]">Project Creation</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Each project is user-scoped with a UUID. A directory <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">project/&lt;project_id&gt;/</code> is created on disk.
                  Skills from <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">install_builder_skills.sh</code> (aitools + MLflow) are copied to <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">.claude/skills/</code> in the project folder.
                </p>
              </div>
            </div>
          </div>

          {/* Claude Code Session */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-info)]/10 text-sm font-semibold text-[var(--color-info)]">2</div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-text-heading)]">Claude Code Session via SDK</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  When you send a message, the backend creates a Claude Code session using the <strong>Claude Agent SDK</strong>.
                  The session runs with <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">cwd</code> set to the project directory (file access is scoped).
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-2">
                  The session is configured with:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-[var(--color-text-muted)]">
                  <li className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-[var(--color-info)]" />
                    <strong>Built-in tools:</strong> Read, Write, Edit, Bash, Glob, Grep, Skill
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-[var(--color-info)]" />
                    <strong>Databricks execution:</strong> Skills guide authenticated CLI and Python SDK commands through Bash
                  </li>
                  <li className="flex items-center gap-2">
                    <ChevronRight className="h-3 w-3 flex-shrink-0 text-[var(--color-info)]" />
                    <strong>System prompt:</strong> Includes cluster/catalog context from UI selection
                  </li>
                </ul>
              </div>
            </div>
          </div>

          {/* Session Resumption */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-success)]/10 text-sm font-semibold text-[var(--color-success)]">3</div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-text-heading)]">Multi-Turn Conversations</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  Each conversation stores a <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">session_id</code>.
                  When you continue a conversation, the SDK resumes from that session - Claude remembers context from previous messages.
                </p>
              </div>
            </div>
          </div>

          {/* File Backup */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-warning)]/10 text-sm font-semibold text-[var(--color-warning)]">4</div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-text-heading)]">File Backup & Restore</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  After each agent query, project files are marked for backup. A background worker (every 10 min) ZIPs the project folder and stores it in PostgreSQL.
                </p>
                <p className="text-sm text-[var(--color-text-muted)] mt-2">
                  On app restart, if the project directory is missing, it's automatically restored from the backup. Skills are re-injected.
                </p>
              </div>
            </div>
          </div>

          {/* Streaming */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-[var(--color-accent-primary)]/20 flex items-center justify-center text-[var(--color-accent-primary)] font-semibold text-sm">5</div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-text-heading)]">Real-Time Streaming</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  The backend streams events via Server-Sent Events (SSE): <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">text</code>, <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">thinking</code>, <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">tool_use</code>, <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">tool_result</code>.
                  You see Claude's reasoning and tool calls in real-time.
                </p>
              </div>
            </div>
          </div>

          {/* Per-User Auth */}
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:p-5">
            <div className="flex min-w-0 items-start gap-3 sm:gap-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-info)]/10 text-sm font-semibold text-[var(--color-info)]">6</div>
              <div className="min-w-0">
                <h3 className="font-semibold text-[var(--color-text-heading)]">Per-User Databricks Auth</h3>
                <p className="text-sm text-[var(--color-text-muted)] mt-1">
                  The backend writes a restrictive project-local <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">.databrickscfg</code> from the request identity.
                  Each user's CLI and SDK commands run with their own Databricks permissions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Authentication & CLI */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-heading)] mb-4">
          Authentication & CLI Execution
        </h2>
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-sm)]">
          <h3 className="font-semibold text-[var(--color-text-heading)] mb-3">Project-Scoped User Authentication</h3>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            The Builder App registers <strong>no MCP servers</strong>. Skills teach Claude which commands to run, and the built-in Bash tool executes the Databricks CLI or short Python SDK scripts.
          </p>
          <p className="text-sm text-[var(--color-text-muted)] mb-3">
            Before each invocation, the backend writes a <code className="px-1.5 py-0.5 rounded bg-[var(--color-background)] text-xs font-mono">0600</code> project CLI profile from the request-scoped user token. Databricks Apps service-principal variables are cleared so unified auth selects the user identity.
          </p>
          <div className="mt-4 rounded-[var(--radius-md)] border-l-2 border-[var(--color-info)] bg-[var(--color-info)]/10 p-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              <strong>Benefits:</strong> One execution path locally and on Apps, no MCP registration or discovery, portable skills, and auditable CLI commands.
            </p>
          </div>
        </div>
      </div>

      {/* Security Warning */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-heading)] mb-4">
          Security Note
        </h2>
        <div className="rounded-[var(--radius-xl)] border border-[var(--color-error)]/30 bg-[var(--color-error)]/10 p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-error)]/15">
              <span className="font-bold text-[var(--color-error)]">!</span>
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-[var(--color-error)]">MVP - Trusted Environment Only</h3>
              <p className="text-sm text-[var(--color-text-muted)]">
                This MVP is <strong>not secure for production use</strong>. Claude Code can execute arbitrary local code, read/write files, and run shell commands within the project directory.
              </p>
              <p className="text-sm text-[var(--color-text-muted)] mt-2">
                A malicious user could potentially execute code on the server. Only deploy this application in trusted environments where all users are authorized and trusted.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tech Stack */}
      <div>
        <h2 className="text-xl font-semibold text-[var(--color-text-heading)] mb-4">
          Tech Stack
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-2">Frontend</h3>
            <div className="flex flex-wrap gap-2">
              {['React', 'TypeScript', 'TailwindCSS', 'Vite'].map((tech) => (
                <span key={tech} className="text-xs px-2 py-1 rounded bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]">
                  {tech}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)]">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-2">Backend</h3>
            <div className="flex flex-wrap gap-2">
              {['FastAPI', 'Claude Agent SDK', 'PostgreSQL'].map((tech) => (
                <span key={tech} className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-success)]">
                  {tech}
                </span>
              ))}
            </div>
          </div>
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4 shadow-[var(--shadow-sm)] sm:col-span-2 lg:col-span-1">
            <h3 className="font-semibold text-[var(--color-text-heading)] mb-2">Integration</h3>
            <div className="flex flex-wrap gap-2">
              {['Databricks CLI', 'Databricks SDK', 'OAuth'].map((tech) => (
                <span key={tech} className="rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-2 py-1 text-xs text-[var(--color-info)]">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DocPage() {
  const [activeSection, setActiveSection] = useState<DocSection>('overview');

  const renderSection = () => {
    switch (activeSection) {
      case 'overview':
        return <OverviewSection />;
      case 'app':
        return <AppSection />;
      default:
        return <OverviewSection />;
    }
  };

  const docSidebar = (
    <nav
      aria-label="Documentation sections"
      className="h-full w-60 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-bg-secondary)]"
    >
      <div className="p-4">
        <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-text-muted)]">
          Documentation
        </p>
        <div className="space-y-1">
        {navItems.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setActiveSection(item.id)}
            aria-current={activeSection === item.id ? 'page' : undefined}
            className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm font-medium transition-colors ${
              activeSection === item.id
                ? 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-heading)] shadow-[var(--shadow-sm)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-heading)]'
            }`}
          >
            <span className={activeSection === item.id ? 'text-[var(--color-accent-primary)]' : undefined}>
              {item.icon}
            </span>
            {item.label}
          </button>
        ))}
        </div>
      </div>
    </nav>
  );

  return (
    <MainLayout sidebar={docSidebar}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <nav
          aria-label="Documentation sections"
          className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-[var(--color-panel)]/95 px-4 py-3 backdrop-blur lg:hidden"
        >
          <div className="mx-auto flex max-w-5xl gap-2 overflow-x-auto pb-0.5">
            {navItems.map((item) => (
              <button
                type="button"
                key={item.id}
                onClick={() => setActiveSection(item.id)}
                aria-current={activeSection === item.id ? 'page' : undefined}
                className={`flex flex-shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeSection === item.id
                    ? 'border-[var(--color-accent-primary)]/30 bg-[var(--color-accent-primary)]/10 text-[var(--color-accent-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-heading)]'
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </nav>
        <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
          {renderSection()}
        </div>
      </div>
    </MainLayout>
  );
}
