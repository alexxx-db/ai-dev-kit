import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import {
  useTheme,
  type ThemePreference,
} from "@/contexts/ThemeContext";

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "light", label: "Light theme", icon: Sun },
  { value: "dark", label: "Dark theme", icon: Moon },
  { value: "system", label: "Use system theme", icon: Monitor },
];

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-0.5 shadow-[var(--shadow-sm)]"
    >
      {themeOptions.map(({ value, label, icon: Icon }) => {
        const isSelected = preference === value;

        return (
          <label
            key={value}
            title={label}
            className={`relative flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--color-focus)] has-[:focus-visible]:ring-offset-1 has-[:focus-visible]:ring-offset-[var(--color-bg-secondary)] ${
              isSelected
                ? "bg-[var(--color-bg-elevated)] text-[var(--color-text-heading)] shadow-[var(--shadow-sm)]"
                : "hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            <input
              type="radio"
              name="color-theme"
              value={value}
              checked={isSelected}
              onChange={() => setPreference(value)}
              aria-label={label}
              className="sr-only"
            />
            <Icon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2} />
          </label>
        );
      })}
    </div>
  );
}
