import * as Dialog from '@radix-ui/react-dialog';
import * as Popover from '@radix-ui/react-popover';
import { AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/* ============================================================================
 * 弹出层六分法统一原语（6-Tier Overlay Architecture）
 * 打断程度：Modal > Popconfirm > Drawer > Alert > Toast > Tooltip
 *
 * 1. Tooltip    —— 悬停/聚焦即现、移开即逝；仅一句话纯文本，绝不塞按钮
 * 2. Toast      —— 操作完成轻量反馈（sonner 2.6s 自动消失），不放重要警告
 * 3. Alert      —— 固定顶部警告条，持续存在直到处理，不遮内容，单条不堆叠
 * 4. Drawer     —— 右侧滑出抽屉，原页留在后面可边看边改，承载详情/学习内容/表单
 * 5. Popconfirm —— 贴靠触发元素的轻确认气泡（确认/取消），用于高频轻量操作
 * 6. Modal      —— 遮罩整页强打断弹窗，仅用于不可逆删除、覆盖导入、强决策
 * ============================================================================ */

/* --------------------------------------------------------------------------
 * 1. Tooltip 悬停提示（只放一句话，不塞按钮，不打断，移开即消失）
 * -------------------------------------------------------------------------- */
export interface TooltipProps {
  /** 一句话纯文本说明（禁止传入按钮或交互元素） */
  content: string;
  side?: 'top' | 'bottom';
  children: ReactNode;
  className?: string;
}

export function Tooltip({ content, side = 'bottom', children, className }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number } | null>(null);
  const tooltipId = useId();

  const show = (target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const clampedLeft = Math.max(88, Math.min(window.innerWidth - 88, rect.left + rect.width / 2));
    const top = side === 'top' ? rect.top - 8 : rect.bottom + 8;
    setCoords({ left: clampedLeft, top });
    setOpen(true);
  };

  return (
    <span
      className={cn('inline-flex items-center', className)}
      onMouseEnter={(e) => show(e.currentTarget)}
      onMouseLeave={() => setOpen(false)}
      onFocus={(e) => show(e.currentTarget)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            data-overlay-type="tooltip"
            style={{
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              transform: side === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            }}
            className="glass-tooltip pointer-events-none fixed z-[80] max-w-[240px] rounded-[9px] px-2.5 py-1.5 text-center text-[12px] leading-[1.4] font-medium text-[var(--ink-1)]"
          >
            {content}
          </span>,
          document.body
        )}
    </span>
  );
}

/* --------------------------------------------------------------------------
 * 3. Alert 警告条（固定在顶部/容器顶，持续存在直到处理，不遮内容，单条不堆叠）
 * -------------------------------------------------------------------------- */
export type AlertTone = 'info' | 'warning' | 'danger';

export interface AlertBannerProps {
  tone?: AlertTone;
  title?: string;
  message: string;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

const ALERT_TONE_CLASS: Record<AlertTone, string> = {
  info: 'border-[var(--accent-border)] bg-[var(--accent-soft)] text-[var(--ink-1)]',
  warning: 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--ink-1)]',
  danger: 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--ink-1)]',
};

export function AlertBanner({
  tone = 'warning',
  title,
  message,
  action,
  onDismiss,
  className,
}: AlertBannerProps) {
  const Icon = tone === 'danger' ? AlertCircle : tone === 'info' ? Info : AlertTriangle;
  const iconColor =
    tone === 'danger'
      ? 'text-[var(--danger)]'
      : tone === 'info'
        ? 'text-[var(--accent)]'
        : 'text-[var(--warning)]';

  return (
    <div
      role="alert"
      data-overlay-type="alert"
      className={cn(
        'glass-alert flex flex-wrap items-center justify-between gap-3 rounded-[13px] border px-4 py-2.5 text-[13.5px]',
        ALERT_TONE_CLASS[tone],
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon size={16} strokeWidth={1.7} className={cn('mt-0.5 shrink-0', iconColor)} />
        <div className="min-w-0 leading-[1.55]">
          {title && <strong className="mr-1.5 font-semibold">{title}</strong>}
          <span className="text-[var(--ink-1)]">{message}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {action}
        {onDismiss && (
          <button
            type="button"
            aria-label="关闭此条提示"
            onClick={onDismiss}
            className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-[7px] border border-transparent bg-transparent text-[var(--ink-2)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]"
          >
            <X size={14} strokeWidth={1.7} />
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------
 * 4. Drawer 抽屉（从右侧滑出，原页保留在后面，边看边查/边看边改）
 * -------------------------------------------------------------------------- */
export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  headerExtra?: ReactNode;
  footer?: ReactNode;
  widthClassName?: string;
  children: ReactNode;
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  headerExtra,
  footer,
  widthClassName,
  children,
}: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {/* 温和透亮弱遮罩：让背后的原页面与星海保持可见 */}
        <Dialog.Overlay className="glass-drawer-overlay fixed inset-0 z-50 bg-[rgba(4,10,24,0.34)] transition-opacity duration-200" />
        <Dialog.Content
          data-overlay-type="drawer"
          className={cn(
            'glass-drawer fixed inset-y-0 right-0 z-50 flex h-full w-[min(480px,94vw)] flex-col outline-none',
            widthClassName
          )}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Dialog.Title className="m-0 text-[17px] font-semibold leading-[1.35] text-[var(--ink-1)]">
                  {title}
                </Dialog.Title>
                {headerExtra}
              </div>
              {description ? (
                <Dialog.Description className="m-0 text-[13px] leading-[1.5] text-[var(--ink-2)]">
                  {description}
                </Dialog.Description>
              ) : (
                <Dialog.Description className="sr-only">{title}</Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭抽屉"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-[9px] border border-[var(--line)] bg-[var(--surface-raised)] text-[var(--ink-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--ink-1)]"
              >
                <X size={15} strokeWidth={1.7} />
              </button>
            </Dialog.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[var(--line)] px-5 py-3.5">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* --------------------------------------------------------------------------
 * 5. Popconfirm 气泡确认（贴在触发元素旁，带确认/取消，仅用于高频轻量操作）
 * -------------------------------------------------------------------------- */
export interface PopconfirmProps {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void | Promise<void>;
  children: ReactNode;
}

export function Popconfirm({
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  tone = 'danger',
  onConfirm,
  children,
}: PopconfirmProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="end"
          sideOffset={8}
          collisionPadding={16}
          data-overlay-type="popconfirm"
          className="glass-popover z-[60] w-[min(272px,86vw)] rounded-[14px] p-3.5 text-left outline-none"
        >
          <div className="flex items-start gap-2.5">
            <AlertTriangle
              size={15}
              strokeWidth={1.8}
              className={cn(
                'mt-0.5 shrink-0',
                tone === 'danger' ? 'text-[var(--danger)]' : 'text-[var(--warning)]'
              )}
            />
            <div className="min-w-0 space-y-1">
              <div className="text-[13.5px] font-semibold leading-[1.4] text-[var(--ink-1)]">
                {title}
              </div>
              {description && (
                <p className="m-0 text-[12.5px] leading-[1.5] text-[var(--ink-2)]">{description}</p>
              )}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {cancelLabel}
            </Button>
            <Button
              size="sm"
              variant={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'primary'}
              onClick={handleConfirm}
              disabled={busy}
            >
              {confirmLabel}
            </Button>
          </div>
          <Popover.Arrow className="fill-[var(--surface-popover)]" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/* --------------------------------------------------------------------------
 * 6. Modal 模态弹窗（遮罩整页，必须处理完才能返回；仅用于高风险/强决策）
 * -------------------------------------------------------------------------- */
export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  tone?: 'neutral' | 'danger' | 'warning';
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void | Promise<void>;
  children?: ReactNode;
}

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  tone = 'neutral',
  confirmLabel = '确认',
  cancelLabel = '取消',
  onConfirm,
  children,
}: ModalProps) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    if (!onConfirm) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[65] bg-[rgba(3,9,22,0.62)] backdrop-blur-[4px]" />
        <Dialog.Content
          data-overlay-type="modal"
          className="glass-popover fixed top-1/2 left-1/2 z-[70] w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 rounded-[18px] p-5 outline-none sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              {tone !== 'neutral' && (
                <span
                  className={cn(
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border',
                    tone === 'danger'
                      ? 'border-[var(--danger-border)] bg-[var(--danger-soft)] text-[var(--danger)]'
                      : 'border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]'
                  )}
                >
                  <AlertTriangle size={16} strokeWidth={1.8} />
                </span>
              )}
              <div className="space-y-1">
                <Dialog.Title className="m-0 text-[17px] font-semibold leading-[1.35] text-[var(--ink-1)]">
                  {title}
                </Dialog.Title>
                {description && (
                  <Dialog.Description className="m-0 text-[13.5px] leading-[1.6] text-[var(--ink-2)]">
                    {description}
                  </Dialog.Description>
                )}
              </div>
            </div>

            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="关闭弹窗"
                className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-transparent text-[var(--ink-3)] hover:bg-[var(--surface-raised)] hover:text-[var(--ink-1)]"
              >
                <X size={15} strokeWidth={1.7} />
              </button>
            </Dialog.Close>
          </div>

          {children && <div className="mt-4">{children}</div>}

          <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-[var(--line)] pt-4">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={busy}>
              {cancelLabel}
            </Button>
            {onConfirm && (
              <Button
                variant={tone === 'danger' ? 'danger' : tone === 'warning' ? 'warning' : 'primary'}
                size="sm"
                onClick={handleConfirm}
                disabled={busy}
              >
                {confirmLabel}
              </Button>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
