import { ChevronRight } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { useUser } from "@/contexts/UserContext";
import { cn } from "@/lib/utils";

interface TopBarProps {
  projectName?: string;
}

export function TopBar({ projectName }: TopBarProps) {
  const location = useLocation();
  const { user } = useUser();

  const displayName = user?.split("@")[0] || "";
  const navItems = [
    { label: "Projects", to: "/", isActive: location.pathname === "/" },
    { label: "Docs", to: "/doc", isActive: location.pathname === "/doc" },
  ];

  return (
    <header className="fixed inset-x-0 top-0 z-30 h-[var(--header-height)] border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/95 shadow-[var(--shadow-sm)] backdrop-blur-md">
      <div className="flex h-full min-w-0 items-center gap-2 px-2.5 sm:px-4 lg:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Link
            to="/"
            aria-label="Builder home"
            className="flex shrink-0 items-center gap-2 rounded-md text-[var(--color-text-heading)]"
          >
            <span className="flex h-7 w-7 items-center justify-center">
              <svg
                aria-hidden="true"
                className="h-6 w-6"
                viewBox="33 0 28 31"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M59.7279 12.5153L47.2039 19.6185L33.8814 12.0502L33.251 12.3884V17.885L47.2039 25.8339L59.7279 18.7306V21.648L47.2039 28.7513L33.8814 21.1829L33.251 21.5212V22.4514L47.2039 30.4002L61.1989 22.4514V16.9548L60.5685 16.6165L47.2039 24.1849L34.7219 17.0816V14.2065L47.2039 21.2675L61.1989 13.3186V7.9066L60.4844 7.52607L47.2039 15.0521L35.3943 8.32941L47.2039 1.64897L56.9541 7.14554L57.8367 6.68044V6.00394L47.2039 0L33.251 7.9066V8.75223L47.2039 16.7011L59.7279 9.59785V12.5153Z"
                  fill="#FF3621"
                />
              </svg>
            </span>
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              Builder
            </span>
          </Link>

          {projectName && (
            <div
              aria-label={`Current project: ${projectName}`}
              className="hidden min-w-0 items-center gap-1.5 border-l border-[var(--color-border)] pl-2 text-sm md:flex"
            >
              <ChevronRight
                aria-hidden="true"
                className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]"
              />
              <span className="max-w-[12rem] truncate font-medium text-[var(--color-text-secondary)] lg:max-w-[18rem]">
                {projectName}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <nav aria-label="Primary navigation" className="flex items-center">
            {navItems.map(({ label, to, isActive }) => (
              <Link
                key={to}
                to={to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative rounded-md px-2 py-1.5 text-xs font-medium transition-colors sm:px-2.5 sm:text-sm",
                  isActive
                    ? "bg-[var(--color-bg-secondary)] text-[var(--color-text-heading)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]",
                )}
              >
                {label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-2 bottom-0 h-px bg-[var(--color-accent-primary)]"
                  />
                )}
              </Link>
            ))}
          </nav>

          <ThemeSwitcher />

          {displayName && (
            <div
              className="hidden min-w-0 items-center gap-2 border-l border-[var(--color-border)] pl-2 lg:flex"
              title={user || undefined}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-tertiary)] text-xs font-semibold text-[var(--color-text-heading)] ring-1 ring-inset ring-[var(--color-border)]">
                {displayName.charAt(0).toUpperCase()}
              </span>
              <span className="max-w-[7rem] truncate text-xs font-medium text-[var(--color-text-secondary)] xl:max-w-[10rem]">
                {displayName}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
