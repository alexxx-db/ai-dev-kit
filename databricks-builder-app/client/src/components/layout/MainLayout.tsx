import { ReactNode } from 'react';
import { TopBar } from './TopBar';

interface MainLayoutProps {
  children: ReactNode;
  projectName?: string;
  sidebar?: ReactNode;
}

export function MainLayout({ children, projectName, sidebar }: MainLayoutProps) {
  return (
    <div className="isolate flex h-screen flex-col overflow-hidden bg-[var(--color-canvas)] text-[var(--color-text-primary)]">
      {/* Top Bar - Fixed position */}
      <TopBar projectName={projectName} />

      {/* Spacer for fixed header */}
      <div className="h-[var(--header-height)] flex-shrink-0" />

      {/* Main Layout */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden bg-[var(--color-canvas)]">
        {/* Sidebar */}
        {sidebar && (
          <div className="hidden flex-shrink-0 lg:block">
            {sidebar}
          </div>
        )}

        {/* Main Content Area */}
        <main className="relative m-2 flex min-w-0 flex-1 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-panel)] shadow-[var(--shadow-sm)] lg:ml-0">
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
