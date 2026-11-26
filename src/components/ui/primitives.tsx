import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type ButtonVariant = 'primary' | 'solid' | 'outline' | 'subtle' | 'ghost' | 'growth' | 'warning' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] text-[var(--accent-fg)] border border-transparent hover:bg-[var(--accent-hover)]',
  solid:
    'bg-[var(--btn-solid-bg)] text-[var(--btn-solid-fg)] border border-transparent hover:bg-[var(--btn-solid-hover)]',
  outline:
    'bg-[var(--surface)] text-[var(--ink-1)] border border-[var(--line-strong)] hover:bg-[var(--surface-raised)]',
  subtle:
    'bg-[var(--surface-raised)] text-[var(--ink-1)] border border-[var(--line)] hover:border-[var(--line-strong)]',
  ghost:
    'bg-transparent text-[var(--ink-2)] border border-transparent hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]',
  growth:
    'bg-[var(--growth)] text-[#081510] border border-transparent hover:opacity-90',
  warning:
    'bg-[var(--warning-soft)] text-[var(--warning)] border border-[var(--warning-border)]',
  danger:
    'bg-transparent text-[var(--danger)] border border-[var(--danger-border)] hover:bg-[var(--danger-soft)]',
};

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-[34px] max-[480px]:min-h-[44px] px-3 py-1.5 text-[13px] rounded-[8px]',
  md: 'min-h-[40px] max-[480px]:min-h-[44px] px-4 py-2 text-[14px] rounded-[8px]',
  lg: 'min-h-[44px] px-5 py-2.5 text-[15px] rounded-[10px]',
  icon: 'h-[36px] w-[36px] max-[480px]:h-[44px] max-[480px]:w-[44px] p-0 rounded-[8px]',
};

export function Button({
  variant = 'outline',
  size = 'md',
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap cursor-pointer select-none',
        'transition-[background-color,border-color,color,transform,opacity] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed disabled:pointer-events-none',
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className
      )}
      {...props}
    />
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'growth' | 'warning' | 'danger';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--surface-raised)] text-[var(--ink-2)] border-[var(--line)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-border)]',
  growth: 'bg-[var(--growth-soft)] text-[var(--growth)] border-[var(--growth-border)]',
  warning: 'bg-[var(--warning-soft)] text-[var(--warning)] border-[var(--warning-border)]',
  danger: 'bg-[var(--danger-soft)] text-[var(--danger)] border-[var(--danger-border)]',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-[6px] border text-[12px] font-medium leading-5 whitespace-nowrap',
        BADGE_TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function Card({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('v3-card p-5 sm:p-6', className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-[8px] bg-[var(--surface-raised)] opacity-75', className)}
    />
  );
}

export function ProgressBar({
  percent,
  color,
  className,
}: {
  percent: number;
  color?: string;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div
      className={cn(
        'h-1.5 w-full rounded-full bg-[var(--surface-raised)] overflow-hidden',
        className
      )}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{
          width: `${clamped}%`,
          backgroundColor: color ?? 'var(--growth)',
        }}
      />
    </div>
  );
}
