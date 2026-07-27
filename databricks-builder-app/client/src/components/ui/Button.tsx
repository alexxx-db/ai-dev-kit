import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'ghost' | 'destructive' | 'outline';
  size?: 'default' | 'sm' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap rounded-lg border border-transparent font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-50',
          // Variants
          variant === 'default' &&
            'bg-[var(--color-accent-primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-accent-secondary)]',
          variant === 'secondary' &&
            'border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-tertiary)]',
          variant === 'ghost' &&
            'text-[var(--color-text-primary)] hover:bg-[var(--color-bg-secondary)]',
          variant === 'destructive' &&
            'bg-[var(--color-destructive)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-destructive-hover)]',
          variant === 'outline' &&
            'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] shadow-[var(--shadow-sm)] hover:border-[var(--color-border-strong)] hover:bg-[var(--color-bg-secondary)]',
          // Sizes
          size === 'default' && 'h-9 px-3.5 text-sm',
          size === 'sm' && 'h-8 px-2.5 text-xs',
          size === 'lg' && 'h-10 px-5 text-sm',
          size === 'icon' && 'h-9 w-9',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
