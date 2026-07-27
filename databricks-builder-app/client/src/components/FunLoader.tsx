import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// Fun loading messages like Claude Code uses
const FUN_MESSAGES = [
  'Thinking...',
  'Pondering...',
  'Contemplating...',
  'Ruminating...',
  'Cogitating...',
  'Deliberating...',
  'Musing...',
  'Reflecting...',
  'Analyzing...',
  'Processing...',
  'Computing...',
  'Synthesizing...',
  'Formulating...',
  'Architecting...',
  'Strategizing...',
  'Investigating...',
  'Researching...',
  'Exploring...',
  'Brainstorming...',
  'Ideating...',
];

interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
}

interface FunLoaderProps {
  todos?: TodoItem[];
  className?: string;
}

export function FunLoader({ todos = [], className }: FunLoaderProps) {
  const [messageIndex, setMessageIndex] = useState(() =>
    Math.floor(Math.random() * FUN_MESSAGES.length)
  );

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reducedMotionQuery.matches) {
      return;
    }

    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % FUN_MESSAGES.length);
    }, 2500);

    return () => clearInterval(interval);
  }, []);

  // Calculate progress
  const completedCount = todos.filter((t) => t.status === 'completed').length;
  const totalCount = todos.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const currentTodo = todos.find((t) => t.status === 'in_progress');

  return (
    <div className={cn('flex flex-col items-start gap-2.5', className)}>
      {/* Main loader with rotating message */}
      <div
        className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-elevated)] px-3.5 py-2.5 shadow-[var(--shadow-sm)]"
        role="status"
        aria-live="polite"
      >
        <span
          aria-hidden="true"
          className="relative flex h-5 w-5 shrink-0 flex-col items-center justify-center gap-[3px]"
        >
          <span className="h-[2px] w-4 -skew-x-[28deg] rounded-full bg-[var(--color-accent-primary)] animate-pulse motion-reduce:animate-none" />
          <span className="h-[2px] w-4 -skew-x-[28deg] rounded-full bg-[var(--color-accent-primary)] opacity-75 animate-pulse [animation-delay:180ms] motion-reduce:animate-none" />
          <span className="h-[2px] w-4 -skew-x-[28deg] rounded-full bg-[var(--color-accent-primary)] opacity-50 animate-pulse [animation-delay:360ms] motion-reduce:animate-none" />
        </span>
        <span className="min-w-[120px] text-sm font-medium text-[var(--color-text-primary)]">
          {FUN_MESSAGES[messageIndex]}
        </span>
      </div>

      {/* Progress section - only show if there are todos */}
      {totalCount > 0 && (
        <div className="w-full max-w-md space-y-2">
          {/* Progress bar */}
          <div
            className="relative h-1.5 w-full overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg-tertiary)]"
            role="progressbar"
            aria-label="Task progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-accent-primary)] transition-[width] duration-500 ease-out motion-reduce:transition-none"
              style={{ width: `${progress}%` }}
            />
          </div>

          {/* Progress text */}
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)]">
            <span>
              {completedCount} of {totalCount} tasks
            </span>
            <span>{Math.round(progress)}%</span>
          </div>

          {/* Current task indicator */}
          {currentTodo && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-xs text-[var(--color-text-muted)]">
              <div className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent-primary)] animate-pulse motion-reduce:animate-none" />
              <span className="truncate">{currentTodo.content}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
