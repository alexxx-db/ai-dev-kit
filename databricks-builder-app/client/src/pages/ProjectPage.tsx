import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUser } from '@/contexts/UserContext';
import {
  ArrowUp,
  Check,
  ChevronDown,
  ClipboardCopy,
  FileCode2,
  ExternalLink,
  Loader2,
  Settings2,
  Square,
  Sparkles,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { MainLayout } from '@/components/layout/MainLayout';
import { Sidebar } from '@/components/layout/Sidebar';
import { SkillsExplorer } from '@/components/SkillsExplorer';
import { FunLoader } from '@/components/FunLoader';
import {
  createConversation,
  deleteConversation,
  fetchClusters,
  fetchConversation,
  fetchConversations,
  fetchExecutions,
  fetchProject,
  fetchWarehouses,
  invokeAgent,
  reconnectToExecution,
  stopExecution,
} from '@/lib/api';
import type { Cluster, Conversation, Message, Project, Warehouse, TodoItem } from '@/lib/types';
import { cn } from '@/lib/utils';

// Combined activity item for display
interface ActivityItem {
  id: string;
  type: 'thinking' | 'tool_use' | 'tool_result';
  content: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  isError?: boolean;
  timestamp: number;
}

// Databricks logo mark SVG
function DatabricksLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M18 2L3 10.5V12.5L18 21L33 12.5V10.5L18 2Z" fill="currentColor" />
      <path d="M18 24.5L3 16V18L18 27L33 18V16L18 24.5Z" fill="currentColor" />
      <path d="M18 30.5L3 22V24L18 33L33 24V22L18 30.5Z" fill="currentColor" opacity="0.7" />
    </svg>
  );
}

function formatToolName(tool: string) {
  return tool.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getToolKind(tool?: string) {
  const normalized = tool?.toLowerCase() || '';
  if (normalized.includes('bash') || normalized.includes('shell') || normalized.includes('terminal')) {
    return { label: 'Bash', Icon: Terminal };
  }
  if (
    normalized.includes('read') ||
    normalized.includes('write') ||
    normalized.includes('edit') ||
    normalized.includes('file') ||
    normalized.includes('glob')
  ) {
    return { label: 'File', Icon: FileCode2 };
  }
  return { label: normalized.includes('skill') ? 'Skill' : 'Tool', Icon: Wrench };
}

// Expandable tools list for a message
function ToolsUsedBadge({ tools }: { tools: string[] }) {
  const [expanded, setExpanded] = useState(false);

  if (tools.length === 0) return null;

  const uniqueTools = [...new Set(tools)];

  return (
    <div className="mt-3 border-l border-[var(--color-border-strong)] pl-3">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 rounded text-[11px] font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        <Wrench className="h-3 w-3" />
        <span>{uniqueTools.length} operation{uniqueTools.length !== 1 ? 's' : ''}</span>
        <span className="text-[var(--color-success)]">Completed</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-2 space-y-1">
          {uniqueTools.map((tool) => {
            const { label, Icon } = getToolKind(tool);
            return (
              <div
                key={tool}
                className="flex items-center gap-2 text-[11px] text-[var(--color-text-secondary)]"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                  <Icon className="h-3 w-3 text-[var(--color-text-muted)]" />
                </span>
                <span className="font-medium text-[var(--color-text-muted)]">{label}</span>
                <span className="truncate">{formatToolName(tool)}</span>
                <Check className="ml-auto h-3 w-3 text-[var(--color-success)]" />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Copy button for code blocks
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="absolute right-2 top-2 rounded-md border border-[var(--color-code-border)] bg-[var(--color-bg-elevated)] p-1.5 text-[var(--color-text-muted)] opacity-0 shadow-[var(--shadow-sm)] transition-[color,background-color,opacity] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] focus-visible:opacity-100 group-hover/code:opacity-100"
      aria-label={copied ? 'Copied code' : 'Copy code'}
      title={copied ? 'Copied!' : 'Copy code'}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-[var(--color-success)]" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
    </button>
  );
}

function MessageCopyControl({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-medium text-[var(--color-text-muted)] opacity-0 transition-[color,background-color,opacity] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)] focus-visible:opacity-100 group-hover/msg:opacity-100 group-focus-within/msg:opacity-100"
      aria-label={copied ? 'Message copied' : 'Copy message'}
      title={copied ? 'Copied' : 'Copy message'}
    >
      {copied ? <Check className="h-3 w-3 text-[var(--color-success)]" /> : <ClipboardCopy className="h-3 w-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

// Activity indicator - shows current tool with animated dots
function ActivitySection({
  items,
  isStreaming,
}: {
  items: ActivityItem[];
  isStreaming: boolean;
}) {
  if (items.length === 0) return null;

  const toolUses = items.filter((item) => item.type === 'tool_use');
  if (toolUses.length === 0) return null;
  const visibleTools = toolUses.slice(-4);

  return (
    <div className="mb-5 ml-9 max-w-2xl rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 shadow-[var(--shadow-sm)]">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--color-text-muted)]">
          Execution
        </span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-info)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-info)] animate-pulse" />
          Running
        </span>
      </div>
      <div className="space-y-0.5">
        {visibleTools.map((item, index) => {
          const result = items.find((candidate) => candidate.id === `result-${item.id}`);
          const running = isStreaming && !result && index === visibleTools.length - 1;
          const { label, Icon } = getToolKind(item.toolName);
          return (
            <div key={item.id} className="relative flex min-w-0 items-center gap-2 py-1 text-xs">
              <span className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border bg-[var(--color-bg-elevated)]',
                result?.isError ? 'border-[var(--color-error)]/40 text-[var(--color-error)]' : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
              )}>
                <Icon className={cn('h-3 w-3', running && 'animate-pulse')} />
              </span>
              <span className="w-8 flex-shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {label}
              </span>
              <span className="truncate text-[var(--color-text-secondary)]">
                {formatToolName(item.toolName || 'Working')}
              </span>
              {result?.isError ? (
                <span className="ml-auto text-[10px] font-medium text-[var(--color-error)]">Error</span>
              ) : result ? (
                <Check className="ml-auto h-3 w-3 text-[var(--color-success)]" />
              ) : (
                <Loader2 className="ml-auto h-3 w-3 animate-spin text-[var(--color-info)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Custom dropdown for cluster/warehouse selection with status indicators
function ResourceDropdown<T extends { state: string }>({
  label,
  items,
  selectedId,
  onSelect,
  nameKey,
  idKey,
}: {
  label: string;
  items: T[];
  selectedId?: string;
  onSelect: (id: string | undefined) => void;
  nameKey: keyof T;
  idKey: keyof T;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) { document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler); }
  }, [open]);

  const selected = items.find((i) => String(i[idKey]) === selectedId);
  const selectedName = selected ? String(selected[nameKey] || '') : '';

  return (
    <div ref={ref} className="relative">
      <label className="text-[11px] font-semibold text-[var(--color-text-secondary)]">{label}</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="mt-1 flex h-9 w-full items-center justify-between rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-xs shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-border-strong)]"
      >
        <div className="flex items-center gap-2 min-w-0">
          {selected && (
            <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full',
              selected.state === 'RUNNING' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'
            )} />
          )}
          <span className={cn('truncate', selected ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]')}>
            {selectedName || `Select ${label.toLowerCase()}...`}
          </span>
        </div>
        <ChevronDown className={cn('h-4 w-4 text-[var(--color-text-muted)] transition-transform flex-shrink-0', open && 'rotate-180')} />
      </button>
      {open && (
        <div role="listbox" className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-52 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-md)]">
          {items.map((item) => {
            const id = String(item[idKey]);
            const name = String(item[nameKey] || '');
            const isSelected = id === selectedId;
            return (
              <button
                key={id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => { onSelect(id); setOpen(false); }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors',
                  isSelected ? 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-heading)]' : 'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]'
                )}
              >
                <span className={cn('h-1.5 w-1.5 flex-shrink-0 rounded-full',
                  item.state === 'RUNNING' ? 'bg-[var(--color-success)]' : 'bg-[var(--color-text-muted)]'
                )} />
                <div className="flex-1 min-w-0">
                  <span className="truncate block">{name}</span>
                  <span className={cn('text-[9px] uppercase tracking-wider', item.state === 'RUNNING' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]')}>
                    {item.state}
                  </span>
                </div>
                {isSelected && <Check className="h-4 w-4 flex-shrink-0 text-[var(--color-accent-primary)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Configuration panel component
function ConfigPanel({
  isOpen,
  onClose,
  defaultCatalog,
  setDefaultCatalog,
  defaultSchema,
  setDefaultSchema,
  clusters,
  selectedClusterId,
  setSelectedClusterId,
  warehouses,
  selectedWarehouseId,
  setSelectedWarehouseId,
  workspaceFolder,
  setWorkspaceFolder,
  mlflowExperimentName,
  setMlflowExperimentName,
  workspaceUrl,
}: {
  isOpen: boolean;
  onClose: () => void;
  defaultCatalog: string;
  setDefaultCatalog: (v: string) => void;
  defaultSchema: string;
  setDefaultSchema: (v: string) => void;
  clusters: Cluster[];
  selectedClusterId?: string;
  setSelectedClusterId: (v: string | undefined) => void;
  warehouses: Warehouse[];
  selectedWarehouseId?: string;
  setSelectedWarehouseId: (v: string | undefined) => void;
  workspaceFolder: string;
  setWorkspaceFolder: (v: string) => void;
  mlflowExperimentName: string;
  setMlflowExperimentName: (v: string) => void;
  workspaceUrl: string | null;
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-[min(23rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5">
        <div>
          <h3 className="text-xs font-semibold text-[var(--color-text-heading)]">Project context</h3>
          <p className="mt-0.5 text-[10px] text-[var(--color-text-muted)]">Passed to every agent run</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close configuration" className="rounded-md p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]">
          <X className="h-4 w-4 text-[var(--color-text-muted)]" />
        </button>
      </div>
      <div className="space-y-3.5 p-4">
        <div>
          <label className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Catalog and schema</label>
          <div className="mt-1 flex items-center overflow-hidden rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] focus-within:border-[var(--color-focus)] focus-within:ring-2 focus-within:ring-[var(--color-focus)]/20">
            <input
              type="text"
              value={defaultCatalog}
              onChange={(e) => setDefaultCatalog(e.target.value)}
              placeholder="catalog"
              aria-label="Default catalog"
              className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
            <span className="select-none text-sm text-[var(--color-text-muted)]">/</span>
            <input
              type="text"
              value={defaultSchema}
              onChange={(e) => setDefaultSchema(e.target.value)}
              placeholder="schema"
              aria-label="Default schema"
              className="h-9 min-w-0 flex-1 bg-transparent px-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            />
            {workspaceUrl && defaultCatalog && defaultSchema && (
              <a
                href={`${workspaceUrl}/explore/data/${defaultCatalog}/${defaultSchema}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center border-l border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-accent-primary)]"
                title="Open in Catalog Explorer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {clusters.length > 0 && (
            <ResourceDropdown
              label="Cluster"
              items={clusters}
              selectedId={selectedClusterId}
              onSelect={setSelectedClusterId}
              nameKey="cluster_name"
              idKey="cluster_id"
            />
          )}
          {warehouses.length > 0 && (
            <ResourceDropdown
              label="SQL warehouse"
              items={warehouses}
              selectedId={selectedWarehouseId}
              onSelect={setSelectedWarehouseId}
              nameKey="warehouse_name"
              idKey="warehouse_id"
            />
          )}
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[var(--color-text-secondary)]">Workspace folder</label>
          <input
            type="text"
            value={workspaceFolder}
            onChange={(e) => setWorkspaceFolder(e.target.value)}
            placeholder="/Workspace/Users/..."
            className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-xs text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20"
          />
        </div>

        <div>
          <label className="text-[11px] font-semibold text-[var(--color-text-secondary)]">MLflow experiment</label>
          <input
            type="text"
            value={mlflowExperimentName}
            onChange={(e) => setMlflowExperimentName(e.target.value)}
            placeholder="Experiment ID or name"
            className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2.5 text-xs text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-focus)] focus:outline-none focus:ring-2 focus:ring-[var(--color-focus)]/20"
          />
        </div>
      </div>
    </div>
  );
}

// Sanitize string for schema name: only a-z, 0-9, _ allowed
function sanitizeForSchema(str: string): string {
  return str.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
}

// Convert email + project name to schema name: quentin.ambard@databricks.com + "My Project" -> quentin_ambard_my_project
function toSchemaName(email: string | null, projectName: string | null): string {
  if (!email) return '';
  const localPart = email.split('@')[0];
  const emailPart = sanitizeForSchema(localPart);
  if (!projectName) return emailPart;
  const projectPart = sanitizeForSchema(projectName);
  return `${emailPart}_${projectPart}`;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const { user, workspaceUrl } = useUser();

  // State
  const [project, setProject] = useState<Project | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [streamingConvIds, setStreamingConvIds] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [activityItems, setActivityItems] = useState<ActivityItem[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [selectedClusterId, setSelectedClusterId] = useState<string | undefined>();
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | undefined>();
  const [defaultCatalog, setDefaultCatalog] = useState<string>('ai_dev_kit');
  const [defaultSchema, setDefaultSchema] = useState<string>('');
  const [workspaceFolder, setWorkspaceFolder] = useState<string>('');
  const [mlflowExperimentName, setMlflowExperimentName] = useState<string>('');
  const [skillsExplorerOpen, setSkillsExplorerOpen] = useState(false);
  const [activeExecutionId, setActiveExecutionId] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [messageTools, setMessageTools] = useState<Record<string, string[]>>({});

  // Calculate default schema from user email + project name once available
  const userDefaultSchema = useMemo(() => toSchemaName(user, project?.name ?? null), [user, project?.name]);

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const reconnectAttemptedRef = useRef<string | null>(null);
  const currentConvIdRef = useRef<string | undefined>(undefined);
  // Per-conversation streaming data (supports concurrent streams)
  const allStreamsRef = useRef<Record<string, {
    fullText: string;
    activityItems: ActivityItem[];
    todos: TodoItem[];
    tools: string[];
    executionId: string | null;
    abortController: AbortController | null;
    isReconnecting: boolean;
    pendingMessages: Message[]; // messages not yet saved to DB (user msg + partial assistant)
  }>>({});

  // Keep currentConvIdRef in sync with state
  useEffect(() => { currentConvIdRef.current = currentConversation?.id; }, [currentConversation?.id]);

  // Load project and conversations
  useEffect(() => {
    if (!projectId) return;

    const loadData = async () => {
      try {
        setIsLoading(true);
        const [projectData, conversationsData, clustersData, warehousesData] = await Promise.all([
          fetchProject(projectId),
          fetchConversations(projectId),
          fetchClusters().catch(() => []), // Don't fail if clusters can't be loaded
          fetchWarehouses().catch(() => []), // Don't fail if warehouses can't be loaded
        ]);
        setProject(projectData);
        setConversations(conversationsData);
        setClusters(clustersData);
        setWarehouses(warehousesData);

        // Load first conversation if available
        if (conversationsData.length > 0) {
          const conv = await fetchConversation(projectId, conversationsData[0].id);
          setCurrentConversation(conv);
          setMessages(conv.messages || []);
          // Restore cluster selection from conversation, or default to first cluster
          if (conv.cluster_id) {
            setSelectedClusterId(conv.cluster_id);
          } else if (clustersData.length > 0) {
            setSelectedClusterId(clustersData[0].cluster_id);
          }
          // Restore warehouse selection from conversation, or default to first warehouse
          if (conv.warehouse_id) {
            setSelectedWarehouseId(conv.warehouse_id);
          } else if (warehousesData.length > 0) {
            setSelectedWarehouseId(warehousesData[0].warehouse_id);
          }
          // Restore catalog/schema from conversation
          if (conv.default_catalog) {
            setDefaultCatalog(conv.default_catalog);
          }
          if (conv.default_schema) {
            setDefaultSchema(conv.default_schema);
          }
          // Restore workspace folder from conversation
          if (conv.workspace_folder) {
            setWorkspaceFolder(conv.workspace_folder);
          }
        } else {
          // No conversation yet, but still select first cluster/warehouse
          if (clustersData.length > 0) {
            setSelectedClusterId(clustersData[0].cluster_id);
          }
          if (warehousesData.length > 0) {
            setSelectedWarehouseId(warehousesData[0].warehouse_id);
          }
        }
      } catch (error) {
        console.error('Failed to load project:', error);
        toast.error('Failed to load project');
        navigate('/');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [projectId, navigate]);

  // Check for active execution when conversation loads and reconnect if needed
  useEffect(() => {
    if (!projectId || !currentConversation?.id || isLoading || allStreamsRef.current[currentConversation.id]) return;

    // Skip if we've already checked this conversation
    if (reconnectAttemptedRef.current === currentConversation.id) return;
    reconnectAttemptedRef.current = currentConversation.id;

    const checkAndReconnect = async () => {
      try {
        const { active } = await fetchExecutions(projectId, currentConversation.id);

        if (active && active.status === 'running') {
          console.log('[RECONNECT] Found active execution:', active.id);
          const reconConvId = currentConversation.id;
          const controller = new AbortController();
          allStreamsRef.current[reconConvId] = {
            fullText: '',
            activityItems: [],
            todos: [],
            tools: [],
            executionId: active.id,
            abortController: controller,
            isReconnecting: true,
            pendingMessages: [],
          };
          setStreamingConvIds(prev => [...prev, reconConvId]);
          setIsReconnecting(true);
          setActiveExecutionId(active.id);

          let fullText = '';

          await reconnectToExecution({
            executionId: active.id,
            storedEvents: active.events,
            signal: controller.signal,
            onEvent: (event) => {
              const type = event.type as string;
              const stream = allStreamsRef.current[reconConvId];
              const isForeground = currentConvIdRef.current === reconConvId;

              if (type === 'text_delta') {
                const text = event.text as string;
                fullText += text;
                if (stream) stream.fullText = fullText;
                if (isForeground) setStreamingText(fullText);
              } else if (type === 'text') {
                const text = event.text as string;
                if (text) {
                  if (fullText && !fullText.endsWith('\n') && !text.startsWith('\n')) {
                    fullText += '\n\n';
                  }
                  fullText += text;
                  if (stream) stream.fullText = fullText;
                  if (isForeground) setStreamingText(fullText);
                }
              } else if (type === 'tool_use') {
                const newItem: ActivityItem = {
                  id: event.tool_id as string,
                  type: 'tool_use',
                  content: '',
                  toolName: event.tool_name as string,
                  toolInput: event.tool_input as Record<string, unknown>,
                  timestamp: Date.now(),
                };
                if (stream) {
                  stream.activityItems = [...stream.activityItems, newItem];
                  stream.tools = [...stream.tools, event.tool_name as string];
                }
                if (isForeground) setActivityItems(prev => [...prev, newItem]);
              } else if (type === 'tool_result') {
                const newItem: ActivityItem = {
                  id: `result-${event.tool_use_id}`,
                  type: 'tool_result',
                  content: typeof event.content === 'string' ? event.content : JSON.stringify(event.content),
                  isError: event.is_error as boolean,
                  timestamp: Date.now(),
                };
                if (stream) stream.activityItems = [...stream.activityItems, newItem];
                if (isForeground) setActivityItems(prev => [...prev, newItem]);
              } else if (type === 'todos') {
                const todoItems = event.todos as TodoItem[];
                if (todoItems) {
                  if (stream) stream.todos = todoItems;
                  if (isForeground) setTodos(todoItems);
                }
              } else if (type === 'error') {
                toast.error(event.error as string, { duration: 8000 });
              }
            },
            onError: (error) => {
              console.error('Reconnect error:', error);
              toast.error('Failed to reconnect to execution');
              delete allStreamsRef.current[reconConvId];
              setStreamingConvIds(prev => prev.filter(id => id !== reconConvId));
              if (currentConvIdRef.current === reconConvId) {
                setIsReconnecting(false);
                setActiveExecutionId(null);
                setStreamingText('');
                setActivityItems([]);
                setTodos([]);
              }
              // Reload saved messages — do not leave the UI stuck reconnecting.
              fetchConversation(projectId, reconConvId)
                .then((conv) => {
                  if (currentConvIdRef.current === reconConvId) {
                    setCurrentConversation(conv);
                    setMessages(conv.messages || []);
                  }
                })
                .catch(() => undefined);
            },
            onDone: async () => {
              delete allStreamsRef.current[reconConvId];
              setStreamingConvIds(prev => prev.filter(id => id !== reconConvId));

              const conv = await fetchConversation(projectId, reconConvId);
              if (currentConvIdRef.current === reconConvId) {
                setCurrentConversation(conv);
                setMessages(conv.messages || []);
                setStreamingText('');
                setIsReconnecting(false);
                setActiveExecutionId(null);
                setActivityItems([]);
                setTodos([]);
              }
              fetchConversations(projectId).then(setConversations);
            },
          });
        }
      } catch (error) {
        console.error('Failed to check for active executions:', error);
        // Don't show error toast - this is a background check
      }
    };

    checkAndReconnect();
  }, [projectId, currentConversation?.id, isLoading]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText, activityItems]);

  // Set default schema from user email once when first available
  const schemaDefaultApplied = useRef(false);
  useEffect(() => {
    if (userDefaultSchema && !schemaDefaultApplied.current && !defaultSchema) {
      setDefaultSchema(userDefaultSchema);
      schemaDefaultApplied.current = true;
    }
  }, [userDefaultSchema]);

  // Set default workspace folder from user email and project name once when first available
  const folderDefaultApplied = useRef(false);
  useEffect(() => {
    if (user && project?.name && !folderDefaultApplied.current && !workspaceFolder) {
      const projectFolder = sanitizeForSchema(project.name);
      setWorkspaceFolder(`/Workspace/Users/${user}/ai_dev_kit/${projectFolder}`);
      folderDefaultApplied.current = true;
    }
  }, [user, project?.name]);

  // Select a conversation
  const handleSelectConversation = async (conversationId: string) => {
    if (!projectId || currentConversation?.id === conversationId) return;

    // Update ref immediately so stream callbacks target the right conversation
    currentConvIdRef.current = conversationId;
    // Reset reconnect tracking for the new conversation
    reconnectAttemptedRef.current = null;

    try {
      const conv = await fetchConversation(projectId, conversationId);
      setCurrentConversation(conv);

      // Sync streaming UI state for the new conversation
      const stream = allStreamsRef.current[conversationId];
      if (stream) {
        // Merge API messages with pending messages not yet saved to DB
        const apiMessages = conv.messages || [];
        const pending = stream.pendingMessages || [];
        const apiIds = new Set(apiMessages.map(m => m.content + m.role));
        const missingPending = pending.filter(m => !apiIds.has(m.content + m.role));
        setMessages([...missingPending, ...apiMessages]);
        setStreamingText(stream.fullText);
        setActivityItems([...stream.activityItems]);
        setTodos([...stream.todos]);
        setActiveExecutionId(stream.executionId);
        setIsReconnecting(stream.isReconnecting);
      } else {
        setMessages(conv.messages || []);
        setStreamingText('');
        setActivityItems([]);
        setTodos([]);
        setActiveExecutionId(null);
        setIsReconnecting(false);
      }
      // Restore cluster selection from conversation, or default to first cluster
      setSelectedClusterId(conv.cluster_id || (clusters.length > 0 ? clusters[0].cluster_id : undefined));
      // Restore warehouse selection from conversation, or default to first warehouse
      setSelectedWarehouseId(conv.warehouse_id || (warehouses.length > 0 ? warehouses[0].warehouse_id : undefined));
      // Restore catalog/schema from conversation, or use defaults
      setDefaultCatalog(conv.default_catalog || 'ai_dev_kit');
      setDefaultSchema(conv.default_schema || userDefaultSchema);
      // Restore workspace folder from conversation, or use default
      const projectFolder = project?.name ? sanitizeForSchema(project.name) : projectId;
      setWorkspaceFolder(conv.workspace_folder || (user ? `/Workspace/Users/${user}/ai_dev_kit/${projectFolder}` : ''));
    } catch (error) {
      console.error('Failed to load conversation:', error);
      toast.error('Failed to load conversation');
    }
  };

  // Create new conversation
  const handleNewConversation = async () => {
    if (!projectId) return;

    try {
      const conv = await createConversation(projectId);
      currentConvIdRef.current = conv.id; // Update ref immediately
      setConversations((prev) => [conv, ...prev]);
      setCurrentConversation(conv);
      setMessages([]);
      // Clear streaming UI (new conv isn't streaming yet)
      setStreamingText('');
      setActivityItems([]);
      setTodos([]);
      setActiveExecutionId(null);
      setIsReconnecting(false);
      inputRef.current?.focus();
    } catch (error) {
      console.error('Failed to create conversation:', error);
      toast.error('Failed to create conversation');
    }
  };

  // Delete conversation
  const handleDeleteConversation = async (conversationId: string) => {
    if (!projectId) return;

    try {
      await deleteConversation(projectId, conversationId);
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));

      // Clean up any active stream for this conversation
      const stream = allStreamsRef.current[conversationId];
      if (stream) {
        stream.abortController?.abort();
        delete allStreamsRef.current[conversationId];
        setStreamingConvIds(prev => prev.filter(id => id !== conversationId));
      }

      if (currentConversation?.id === conversationId) {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        if (remaining.length > 0) {
          const conv = await fetchConversation(projectId, remaining[0].id);
          setCurrentConversation(conv);
          setMessages(conv.messages || []);
        } else {
          setCurrentConversation(null);
          setMessages([]);
        }
        setStreamingText('');
        setActivityItems([]);
        setTodos([]);
        setActiveExecutionId(null);
      }
      toast.success('Conversation deleted');
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      toast.error('Failed to delete conversation');
    }
  };

  // Send message
  const handleSendMessage = useCallback(async () => {
    if (!projectId || !input.trim()) return;
    const convId = currentConversation?.id;
    // Block only if THIS conversation is already streaming
    if (convId && allStreamsRef.current[convId]) return;

    const userMessage = input.trim();
    setInput('');
    setStreamingText('');
    setActivityItems([]);
    setTodos([]);

    // Add user message to UI immediately
    const tempUserMessage: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: convId || '',
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      is_error: false,
    };
    setMessages((prev) => [...prev, tempUserMessage]);

    // Create abort controller and initialize stream tracking
    const abortController = new AbortController();
    const effectiveConvId = convId || '';
    let streamKey = effectiveConvId;
    allStreamsRef.current[streamKey] = {
      fullText: '',
      activityItems: [],
      todos: [],
      tools: [],
      executionId: null,
      abortController,
      isReconnecting: false,
      pendingMessages: [tempUserMessage],
    };
    setStreamingConvIds(prev => [...prev, effectiveConvId]);

    try {
      let conversationId = convId;
      let fullText = '';

      await invokeAgent({
        projectId,
        conversationId,
        message: userMessage,
        clusterId: selectedClusterId,
        defaultCatalog,
        defaultSchema,
        warehouseId: selectedWarehouseId,
        workspaceFolder,
        mlflowExperimentName: mlflowExperimentName || null,
        signal: abortController.signal,
        onExecutionId: (executionId) => {
          const stream = allStreamsRef.current[streamKey];
          if (stream) stream.executionId = executionId;
          if (currentConvIdRef.current === streamKey) setActiveExecutionId(executionId);
        },
        onEvent: (event) => {
          const type = event.type as string;
          const stream = allStreamsRef.current[streamKey];
          const isForeground = currentConvIdRef.current === streamKey;

          if (type === 'conversation.created') {
            const newConvId = event.conversation_id as string;
            // Move stream entry from old key to new key
            const oldStream = allStreamsRef.current[streamKey];
            delete allStreamsRef.current[streamKey];
            const oldKey = streamKey;
            streamKey = newConvId;
            allStreamsRef.current[newConvId] = oldStream || {
              fullText: '', activityItems: [], todos: [], tools: [],
              executionId: null, abortController, isReconnecting: false,
              pendingMessages: [],
            };
            conversationId = newConvId;
            // Update streamingConvIds from old key to new key
            setStreamingConvIds(prev => prev.filter(id => id !== oldKey).concat(newConvId));
            // Set currentConversation immediately so UI stays consistent
            setCurrentConversation((prev) => prev ?? {
              id: newConvId,
              project_id: projectId,
              title: 'New Chat',
              created_at: new Date().toISOString(),
              conversation_count: 0,
            } as unknown as Conversation);
            currentConvIdRef.current = newConvId;
            fetchConversations(projectId).then(setConversations);
          } else if (type === 'text_delta') {
            const text = event.text as string;
            fullText += text;
            if (stream) stream.fullText = fullText;
            if (isForeground) setStreamingText(fullText);
          } else if (type === 'text') {
            const text = event.text as string;
            if (text) {
              if (fullText && !fullText.endsWith('\n') && !text.startsWith('\n')) {
                fullText += '\n\n';
              }
              fullText += text;
              if (stream) stream.fullText = fullText;
              if (isForeground) setStreamingText(fullText);
            }
          } else if (type === 'thinking' || type === 'thinking_delta') {
            const thinking = (event.thinking as string) || '';
            if (thinking) {
              const updateThinking = (prev: ActivityItem[]) => {
                if (type === 'thinking_delta' && prev.length > 0 && prev[prev.length - 1].type === 'thinking') {
                  const updated = [...prev];
                  updated[updated.length - 1] = {
                    ...updated[updated.length - 1],
                    content: updated[updated.length - 1].content + thinking,
                  };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    id: `thinking-${Date.now()}`,
                    type: 'thinking' as const,
                    content: thinking,
                    timestamp: Date.now(),
                  },
                ];
              };
              if (stream) stream.activityItems = updateThinking(stream.activityItems);
              if (isForeground) setActivityItems(updateThinking);
            }
          } else if (type === 'tool_use') {
            const toolName = event.tool_name as string;
            const newItem: ActivityItem = {
              id: event.tool_id as string,
              type: 'tool_use',
              content: '',
              toolName,
              toolInput: event.tool_input as Record<string, unknown>,
              timestamp: Date.now(),
            };
            if (stream) {
              stream.tools = [...stream.tools, toolName];
              stream.activityItems = [...stream.activityItems, newItem];
            }
            if (isForeground) setActivityItems(prev => [...prev, newItem]);
          } else if (type === 'tool_result') {
            let content = event.content as string;

            if (event.is_error && typeof content === 'string') {
              const errorMatch = content.match(/<tool_use_error>(.*?)<\/tool_use_error>/s);
              if (errorMatch) {
                content = errorMatch[1].trim();
              }
              if (content === 'Stream closed' || content.includes('Stream closed')) {
                content = 'Tool execution interrupted: The operation took too long or the connection was lost. This may happen when operations exceed the 50-second timeout window. Check backend logs for details.';
              }
            }

            const newItem: ActivityItem = {
              id: `result-${event.tool_use_id}`,
              type: 'tool_result',
              content: typeof content === 'string' ? content : JSON.stringify(content),
              isError: event.is_error as boolean,
              timestamp: Date.now(),
            };
            if (stream) stream.activityItems = [...stream.activityItems, newItem];
            if (isForeground) setActivityItems(prev => [...prev, newItem]);
          } else if (type === 'error') {
            let errorMsg = event.error as string;
            if (errorMsg === 'Stream closed' || errorMsg.includes('Stream closed')) {
              errorMsg = 'Execution interrupted: The operation took too long or the connection was lost. Operations exceeding 50 seconds may be interrupted. Check backend logs for details.';
            }
            toast.error(errorMsg, { duration: 8000 });
          } else if (type === 'cancelled') {
            toast.info('Generation stopped');
          } else if (type === 'todos') {
            const todoItems = event.todos as TodoItem[];
            if (todoItems) {
              if (stream) stream.todos = todoItems;
              if (isForeground) setTodos(todoItems);
            }
          }
        },
        onError: (error) => {
          console.error('Stream error:', error);
          const errorMessage = error.message || 'Failed to get response';
          toast.error(errorMessage, { duration: 8000 });
        },
        onDone: async () => {
          const finalStreamKey = streamKey;
          const stream = allStreamsRef.current[finalStreamKey];
          const tools = stream?.tools || [];

          if (fullText) {
            const msgId = `msg-${Date.now()}`;
            const assistantMessage: Message = {
              id: msgId,
              conversation_id: conversationId || '',
              role: 'assistant',
              content: fullText,
              timestamp: new Date().toISOString(),
              is_error: false,
            };
            // Only update messages if user is viewing this conversation
            if (currentConvIdRef.current === finalStreamKey) {
              setMessages((prev) => [...prev, assistantMessage]);
            }
            if (tools.length > 0) {
              setMessageTools((prev) => ({ ...prev, [msgId]: tools }));
            }
          }

          // Clean up stream
          delete allStreamsRef.current[finalStreamKey];
          setStreamingConvIds(prev => prev.filter(id => id !== finalStreamKey));

          if (currentConvIdRef.current === finalStreamKey) {
            setStreamingText('');
            setActiveExecutionId(null);
            setActivityItems([]);
            setTodos([]);
          }

          // Fetch full conversation to get updated title and messages
          if (conversationId) {
            const conv = await fetchConversation(projectId, conversationId);
            if (currentConvIdRef.current === finalStreamKey) {
              setCurrentConversation(conv);
            }
            fetchConversations(projectId).then(setConversations);
          }
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      console.error('Failed to send message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send message';
      toast.error(errorMessage, { duration: 8000 });
      // Clean up stream on error
      delete allStreamsRef.current[streamKey];
      setStreamingConvIds(prev => prev.filter(id => id !== streamKey));
      if (currentConvIdRef.current === streamKey) {
        setStreamingText('');
        setActiveExecutionId(null);
        setActivityItems([]);
        setTodos([]);
      }
    }
  }, [projectId, input, currentConversation?.id, selectedClusterId, defaultCatalog, defaultSchema, selectedWarehouseId, workspaceFolder, mlflowExperimentName]);

  // Stop generation - abort client stream AND tell backend to cancel
  const handleStopGeneration = useCallback(async () => {
    const targetId = currentConversation?.id;
    if (!targetId) return;

    const stream = allStreamsRef.current[targetId];
    if (!stream) return;

    // Abort the fetch
    stream.abortController?.abort();

    // Tell the backend to cancel the agent execution
    if (stream.executionId) {
      try {
        await stopExecution(stream.executionId);
      } catch (error) {
        console.error('Failed to stop execution on backend:', error);
      }
    }

    // Save partial response
    if (stream.fullText) {
      const msgId = `msg-stopped-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          id: msgId,
          conversation_id: targetId,
          role: 'assistant' as const,
          content: stream.fullText,
          timestamp: new Date().toISOString(),
          is_error: false,
        },
      ]);
      if (stream.tools.length > 0) {
        setMessageTools((prev) => ({ ...prev, [msgId]: stream.tools }));
      }
    }

    // Clean up stream
    delete allStreamsRef.current[targetId];
    setStreamingConvIds(prev => prev.filter(id => id !== targetId));
    setStreamingText('');
    setActiveExecutionId(null);
    setActivityItems([]);
    setTodos([]);
  }, [currentConversation?.id]);

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Open skills explorer
  const handleViewSkills = () => {
    setSkillsExplorerOpen(true);
  };

  // Config panel state
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  const configPanelRef = useRef<HTMLDivElement>(null);

  // Close config panel on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (configPanelRef.current && !configPanelRef.current.contains(event.target as Node)) {
        setConfigPanelOpen(false);
      }
    };
    if (configPanelOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [configPanelOpen]);

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  };

  // Markdown components shared between messages and streaming
  const markdownComponents = useMemo(() => ({
    a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-accent-primary)] underline decoration-[var(--color-accent-primary)]/30 hover:decoration-[var(--color-accent-primary)] hover:text-[var(--color-accent-secondary)] transition-colors"
      >
        {children}
      </a>
    ),
    pre: ({ children }: { children?: React.ReactNode }) => {
      // Extract text content from children for copy button
      const getTextContent = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node;
        if (!node) return '';
        if (Array.isArray(node)) return node.map(getTextContent).join('');
        if (typeof node === 'object' && 'props' in (node as React.ReactElement)) {
          return getTextContent((node as React.ReactElement).props.children);
        }
        return '';
      };
      const text = getTextContent(children);
      return (
        <div className="group/code relative my-3">
          <pre className="overflow-x-auto !rounded-lg !border !border-[var(--color-code-border)] !bg-[var(--color-code-bg)] !p-4 !text-[var(--color-text-primary)]">
            {children}
          </pre>
          <CopyButton text={text} />
        </div>
      );
    },
    code: ({ children, className }: { children?: React.ReactNode; className?: string }) => {
      // Inline code (no language class)
      if (!className) {
        return (
          <code className="rounded border border-[var(--color-code-border)] bg-[var(--color-code-bg)] px-1.5 py-0.5 font-mono text-[0.875em] text-[var(--color-text-primary)]">
            {children}
          </code>
        );
      }
      // Block code inside pre
      return <code className={cn(className, 'font-mono text-[12px] text-[var(--color-text-primary)]')}>{children}</code>;
    },
    table: ({ children }: { children?: React.ReactNode }) => (
      <div className="my-3 overflow-x-auto rounded-lg border border-[var(--color-border)]/50">
        <table className="w-full text-sm">{children}</table>
      </div>
    ),
    th: ({ children }: { children?: React.ReactNode }) => (
      <th className="px-3 py-2 text-left text-xs font-semibold text-[var(--color-text-heading)] bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]/50">
        {children}
      </th>
    ),
    td: ({ children }: { children?: React.ReactNode }) => (
      <td className="px-3 py-2 text-sm border-b border-[var(--color-border)]/30">
        {children}
      </td>
    ),
  }), []);

  // Config summary for header chips
  const configChips = useMemo(() => {
    const chips: { label: string; color: string }[] = [];
    if (defaultCatalog && defaultSchema) {
      chips.push({ label: `${defaultCatalog}.${defaultSchema}`, color: 'text-[var(--color-accent-primary)]' });
    }
    const cluster = clusters.find(c => c.cluster_id === selectedClusterId);
    if (cluster) {
      const isServerless = cluster.cluster_id === '__serverless__';
      chips.push({ label: isServerless ? 'Serverless Compute' : (cluster.cluster_name || 'Cluster'), color: cluster.state === 'RUNNING' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]' });
    }
    const warehouse = warehouses.find(w => w.warehouse_id === selectedWarehouseId);
    if (warehouse) {
      chips.push({ label: warehouse.warehouse_name || 'Warehouse', color: warehouse.state === 'RUNNING' ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]' });
    }
    return chips;
  }, [defaultCatalog, defaultSchema, clusters, selectedClusterId, warehouses, selectedWarehouseId]);

  // Only show streaming UI if viewing a conversation that is actively streaming
  const isStreamingHere = streamingConvIds.includes(currentConversation?.id || '');

  if (isLoading) {
    return (
      <MainLayout projectName={project?.name}>
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--color-text-muted)]" />
        </div>
      </MainLayout>
    );
  }

  const sidebar = (
    <Sidebar
      conversations={conversations}
      currentConversationId={currentConversation?.id}
      onConversationSelect={handleSelectConversation}
      onNewConversation={handleNewConversation}
      onDeleteConversation={handleDeleteConversation}
      onViewSkills={handleViewSkills}
      isLoading={false}
    />
  );

  return (
    <MainLayout projectName={project?.name} sidebar={sidebar}>
      <div className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-canvas)]">
        {/* Chat Header */}
        <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
              <Sparkles className="h-4 w-4 text-[var(--color-accent-primary)]" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-[var(--color-text-heading)]">
                {currentConversation?.title || 'New Chat'}
              </h2>
              <p className="text-[10px] text-[var(--color-text-muted)]">
                {isStreamingHere ? 'Agent is working' : 'Builder agent'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {/* Config summary chips */}
            <div className="hidden md:flex items-center gap-1.5">
              {configChips.map((chip, i) => (
                <span
                  key={i}
                  className={cn('max-w-[150px] truncate rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-1 text-[10px] font-medium', chip.color)}
                >
                  {chip.label}
                </span>
              ))}
            </div>
            {/* Settings button */}
            <div className="relative" ref={configPanelRef}>
              <button
                type="button"
                onClick={() => setConfigPanelOpen(!configPanelOpen)}
                aria-expanded={configPanelOpen}
                aria-label="Project configuration"
                className={cn(
                  'flex h-8 w-8 items-center justify-center rounded-md border transition-colors',
                  configPanelOpen
                    ? 'border-[var(--color-accent-primary)] bg-[var(--color-bg-tertiary)] text-[var(--color-accent-primary)]'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]'
                )}
                title="Configuration"
              >
                <Settings2 className="h-4.5 w-4.5" />
              </button>
              <ConfigPanel
                isOpen={configPanelOpen}
                onClose={() => setConfigPanelOpen(false)}
                defaultCatalog={defaultCatalog}
                setDefaultCatalog={setDefaultCatalog}
                defaultSchema={defaultSchema}
                setDefaultSchema={setDefaultSchema}
                clusters={clusters}
                selectedClusterId={selectedClusterId}
                setSelectedClusterId={setSelectedClusterId}
                warehouses={warehouses}
                selectedWarehouseId={selectedWarehouseId}
                setSelectedWarehouseId={setSelectedWarehouseId}
                workspaceFolder={workspaceFolder}
                setWorkspaceFolder={setWorkspaceFolder}
                mlflowExperimentName={mlflowExperimentName}
                setMlflowExperimentName={setMlflowExperimentName}
                workspaceUrl={workspaceUrl}
              />
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {messages.length === 0 && !isStreamingHere ? (
            /* Empty State */
            <div className="flex min-h-full items-center justify-center px-5 py-12 sm:px-8">
              <div className="text-center max-w-xl w-full">
                <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
                  <Sparkles className="h-5 w-5 text-[var(--color-accent-primary)]" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight text-[var(--color-text-heading)] sm:text-2xl">
                  What can I help you build?
                </h3>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--color-text-muted)]">
                  Build data pipelines, generate synthetic data, create dashboards, and more on Databricks.
                </p>

                <div className="mt-8 grid gap-2 text-left sm:grid-cols-2">
                  {[
                    { title: 'Generate synthetic data', desc: 'Realistic test datasets with customers, orders, and tickets', prompt: 'Generate synthetic customer data with orders and support tickets' },
                    { title: 'Build a data pipeline', desc: 'ETL workflows with medallion architecture', prompt: 'Create a data pipeline to transform raw data into bronze, silver, and gold layers' },
                    { title: 'Create a dashboard', desc: 'Interactive AI/BI visualizations', prompt: 'Create a dashboard to visualize customer metrics and trends' },
                    { title: 'Explore my data', desc: 'Tables, volumes, and resources in your project', prompt: 'What tables and data do I have in my project?' },
                  ].map((item) => (
                    <button
                      key={item.title}
                      onClick={() => setInput(item.prompt)}
                      className="group rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3.5 text-left shadow-[var(--shadow-sm)] transition-[border-color,background-color] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-secondary)]"
                    >
                      <span className="text-xs font-semibold text-[var(--color-text-heading)] transition-colors group-hover:text-[var(--color-accent-primary)]">{item.title}</span>
                      <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">{item.desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Message Thread */
            <div className="mx-auto max-w-[52rem] space-y-1 px-4 py-7 sm:px-7 sm:py-9">
              {messages.map((message) => (
                <div key={message.id}>
                  {message.role === 'assistant' ? (
                    <div className="group/msg mb-6 flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
                        <DatabricksLogo className="h-3.5 w-3.5 text-[var(--color-accent-primary)]" />
                      </div>
                      <div className={cn('flex-1 min-w-0', message.is_error && 'text-[var(--color-error)]')}>
                        <div className="mb-1.5 flex min-h-5 items-center gap-2">
                          <span className="text-[11px] font-semibold text-[var(--color-text-heading)]">Builder</span>
                          <span className={cn(
                            'rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            message.is_error
                              ? 'bg-[var(--color-error)]/10 text-[var(--color-error)]'
                              : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]'
                          )}>
                            {message.is_error ? 'Error' : 'Complete'}
                          </span>
                          {message.timestamp && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          <MessageCopyControl text={message.content} />
                        </div>
                        <div className="prose prose-xs max-w-none text-[14px] leading-7 text-[var(--color-text-primary)]">
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                        <ToolsUsedBadge tools={messageTools[message.id] || []} />
                      </div>
                    </div>
                  ) : (
                    <div className="group/msg mb-6 flex justify-end">
                      <div className="max-w-[88%] sm:max-w-[76%]">
                        <div className="mb-1 flex min-h-5 items-center justify-end gap-1">
                          <MessageCopyControl text={message.content} />
                          {message.timestamp && (
                            <span className="text-[10px] text-[var(--color-text-muted)]">
                              {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)]">You</span>
                        </div>
                        <div className="rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-secondary)] px-4 py-3 shadow-[var(--shadow-sm)]">
                          <p className="whitespace-pre-wrap text-[14px] leading-6 text-[var(--color-text-primary)]">{message.content}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Streaming response */}
              {isStreamingHere && streamingText && (
                <div className="mb-5 flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
                    <DatabricksLogo className="h-3.5 w-3.5 text-[var(--color-accent-primary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[var(--color-text-heading)]">Builder</span>
                      <span className="inline-flex items-center gap-1.5 rounded bg-[var(--color-info)]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-info)]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-info)]" />
                        Streaming
                      </span>
                    </div>
                    <div className="prose prose-xs max-w-none text-[14px] leading-7 text-[var(--color-text-primary)]">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                        {streamingText}
                      </ReactMarkdown>
                    </div>
                  </div>
                </div>
              )}

              {/* Activity section */}
              {isStreamingHere && activityItems.length > 0 && (
                <ActivitySection items={activityItems} isStreaming={isStreamingHere} />
              )}

              {/* Loader */}
              {isStreamingHere && !streamingText && (
                <div className="mb-5 flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)]">
                    <DatabricksLogo className="h-3.5 w-3.5 text-[var(--color-accent-primary)]" />
                  </div>
                  <div className="flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[var(--color-text-heading)]">Builder</span>
                      <span className="inline-flex items-center gap-1.5 rounded bg-[var(--color-info)]/10 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[var(--color-info)]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-info)]" />
                        Working
                      </span>
                    </div>
                    {isReconnecting ? (
                      <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Reconnecting to agent...</span>
                      </div>
                    ) : (
                      <FunLoader todos={todos} className="py-1" />
                    )}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div
          className="flex-shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)]/95 px-3 pt-3 backdrop-blur sm:px-6"
          style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto max-w-[52rem]">
            <div className="relative overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-md)] transition-[border-color,box-shadow] focus-within:border-[var(--color-focus)] focus-within:ring-2 focus-within:ring-[var(--color-focus)]/20 focus-within:ring-offset-1 focus-within:ring-offset-[var(--color-bg-secondary)]">
              <textarea
                ref={inputRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Message the assistant..."
                rows={1}
                aria-label="Message the builder agent"
                className="w-full resize-none bg-transparent px-4 pb-12 pt-3.5 text-[14px] leading-6 text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
                style={{ maxHeight: 200 }}
                disabled={isStreamingHere}
              />
              <div className="absolute bottom-2 left-3 right-2 flex items-center justify-between gap-3 sm:left-4">
                <div className="flex min-w-0 items-center gap-2 text-[10px] text-[var(--color-text-muted)]">
                  <span className={cn(
                    'flex flex-shrink-0 items-center gap-1.5 font-medium',
                    isStreamingHere ? 'text-[var(--color-info)]' : 'text-[var(--color-text-muted)]'
                  )}>
                    <span className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isStreamingHere ? 'animate-pulse bg-[var(--color-info)]' : 'bg-[var(--color-success)]'
                    )} />
                    {isStreamingHere ? 'Running' : 'Ready'}
                  </span>
                  {configChips[0] && (
                    <>
                      <span aria-hidden="true" className="text-[var(--color-border-strong)]">·</span>
                      <span className="max-w-[12rem] truncate">{configChips[0].label}</span>
                    </>
                  )}
                  <span className="hidden select-none sm:inline">
                    · <kbd className="font-mono">Enter</kbd> send · <kbd className="font-mono">Shift Enter</kbd> newline
                  </span>
                </div>
                {isStreamingHere ? (
                  <button
                    type="button"
                    onClick={handleStopGeneration}
                    className="flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-destructive)] px-2.5 text-xs font-semibold text-white shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-destructive-hover)]"
                    aria-label="Stop generation"
                    title="Stop generation"
                  >
                    <Square className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Stop</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleSendMessage}
                    disabled={!input.trim()}
                    className={cn(
                      'flex h-8 flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors',
                      input.trim()
                        ? 'bg-[var(--color-accent-primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-secondary)]'
                        : 'cursor-not-allowed bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] opacity-60'
                    )}
                    aria-label="Send message"
                    title="Send message"
                  >
                    <ArrowUp className="h-4 w-4" />
                    <span className="hidden sm:inline">Send</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Skills Explorer */}
      {skillsExplorerOpen && projectId && (
        <SkillsExplorer
          projectId={projectId}
          systemPromptParams={{
            clusterId: selectedClusterId,
            warehouseId: selectedWarehouseId,
            defaultCatalog,
            defaultSchema,
            workspaceFolder,
            projectId,
          }}
          onClose={() => setSkillsExplorerOpen(false)}
        />
      )}
    </MainLayout>
  );
}
