import { useState, type MouseEvent } from 'react';
import {
  Plus,
  MessageSquare,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  BookOpen,
} from 'lucide-react';
import type { Conversation } from '@/lib/types';

interface SidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onConversationSelect: (conversationId: string) => void;
  onNewConversation: () => void;
  onDeleteConversation: (conversationId: string) => void;
  onViewSkills?: () => void;
  isLoading?: boolean;
}

export function Sidebar({
  conversations,
  currentConversationId,
  onConversationSelect,
  onNewConversation,
  onDeleteConversation,
  onViewSkills,
  isLoading = false,
}: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const handleDelete = (e: MouseEvent, conversationId: string) => {
    e.stopPropagation();
    if (confirm('Delete this conversation?')) {
      onDeleteConversation(conversationId);
    }
  };

  return (
    <aside
      aria-label="Conversation sidebar"
      className={`
        relative flex h-full flex-shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-panel)] transition-[width] duration-200
        ${isCollapsed ? 'w-14' : 'w-[var(--sidebar-width)]'}
      `}
    >
      {/* Header - New Conversation Button */}
      <div
        className={`${isCollapsed ? 'p-2' : 'px-3 py-3'} border-b border-[var(--color-border)]`}
      >
        <button
          type="button"
          onClick={onNewConversation}
          aria-label={isCollapsed ? 'New chat' : undefined}
          title={isCollapsed ? 'New chat' : undefined}
          className={`group flex h-9 w-full items-center rounded-md border border-[var(--color-border-strong)] bg-[var(--color-elevated)] text-[var(--color-text-heading)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-accent-primary)] hover:bg-[var(--color-bg-tertiary)] ${isCollapsed ? 'justify-center px-2' : 'gap-2 px-2.5'}`}
        >
          <Plus
            aria-hidden="true"
            className="h-4 w-4 flex-shrink-0 text-[var(--color-accent-primary)]"
            strokeWidth={2.25}
          />
          {!isCollapsed && (
            <span className="text-sm font-semibold">
              New Chat
            </span>
          )}
        </button>
      </div>

      {/* Conversations List */}
      {!isCollapsed && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 pb-1.5 pt-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
              Conversations
            </h2>
            <span
              aria-label={`${conversations.length} conversations`}
              className="min-w-5 rounded-full bg-[var(--color-bg-tertiary)] px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-[var(--color-text-secondary)]"
            >
              {conversations.length}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-3">
            {isLoading ? (
              <div
                className="flex flex-col items-center px-4 py-10 text-center text-[var(--color-text-muted)]"
                role="status"
              >
                <span className="mb-3 flex h-8 w-8 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-elevated)]">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-[var(--color-accent-primary)]" />
                </span>
                <p className="text-xs font-medium text-[var(--color-text-secondary)]">Loading conversations</p>
              </div>
            ) : conversations.length === 0 ? (
              <div className="mx-1 mt-2 rounded-lg border border-dashed border-[var(--color-border-strong)] bg-[var(--color-canvas)]/60 px-4 py-8 text-center">
                <span className="mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] shadow-[var(--shadow-sm)]">
                  <MessageSquare aria-hidden="true" className="h-4 w-4 text-[var(--color-text-muted)]" />
                </span>
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">No conversations yet</p>
                <p className="mt-1 text-xs leading-5 text-[var(--color-text-muted)]">
                  Start a chat to build with your project.
                </p>
              </div>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <div
                    key={conv.id}
                    className={`
                      group relative rounded-md border transition-colors
                      ${
                        currentConversationId === conv.id
                          ? 'border-[var(--color-border)] bg-[var(--color-bg-tertiary)]'
                          : 'border-transparent hover:border-[var(--color-border)] hover:bg-[var(--color-canvas)]'
                      }
                    `}
                  >
                    {currentConversationId === conv.id && (
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-1.5 left-0 w-0.5 rounded-r-full bg-[var(--color-accent-primary)]"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onConversationSelect(conv.id)}
                      aria-current={currentConversationId === conv.id ? 'true' : undefined}
                      className="block w-full truncate rounded-md py-2 pl-2.5 pr-9 text-left text-xs font-medium text-[var(--color-text-primary)]"
                    >
                      {conv.title}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(e, conv.id)}
                      aria-label={`Delete conversation: ${conv.title}`}
                      title="Delete conversation"
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--color-text-muted)] opacity-40 transition-[color,background-color,opacity] hover:bg-[var(--color-elevated)] hover:text-[var(--color-error)] hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* View Skills Button */}
      {!isCollapsed && onViewSkills && (
        <div className="border-t border-[var(--color-border)] p-2">
          <button
            type="button"
            onClick={onViewSkills}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-canvas)] hover:text-[var(--color-text-primary)]"
          >
            <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
            View system prompt & skills
          </button>
        </div>
      )}

      {/* Collapse/Expand Button */}
      <div className="absolute -right-3 top-4 z-10">
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!isCollapsed}
          className="group flex h-6 w-6 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-elevated)] text-[var(--color-text-muted)] shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-accent-primary)] hover:text-[var(--color-text-primary)]"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <ChevronRight aria-hidden="true" className="h-3 w-3" />
          ) : (
            <ChevronLeft aria-hidden="true" className="h-3 w-3" />
          )}
        </button>
      </div>
    </aside>
  );
}
