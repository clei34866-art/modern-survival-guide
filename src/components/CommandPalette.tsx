import * as Dialog from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { BookOpen, Compass, FlaskConical, Layers, Monitor, Search, Sparkles, Tag } from 'lucide-react';
import { useEffect } from 'react';
import type { PlatformContentBundle } from '@/core/contentLoader';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  content: PlatformContentBundle;
  onNavigate: (hash: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  content,
  onNavigate,
}: CommandPaletteProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  const jump = (hash: string) => {
    onOpenChange(false);
    onNavigate(hash);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[65] bg-[rgba(3,9,22,0.58)] backdrop-blur-[4px]" />
        <Dialog.Content
          aria-label="全局快速跳转"
          data-overlay-type="modal"
          className="fixed left-1/2 top-[14vh] z-[70] w-[min(600px,92vw)] -translate-x-1/2 outline-none"
        >
          <Dialog.Title className="sr-only">全局快速搜索与跳转</Dialog.Title>
          <Command label="全局快速搜索">
            <div className="flex items-center gap-2.5 px-4 border-b border-[var(--line)]">
              <Search size={16} strokeWidth={1.5} className="text-[var(--ink-3)] shrink-0" />
              <Command.Input
                placeholder="搜任意生活/技能关键词（如：外卖、比价、领券、体检、退税、押金、12315、谈薪）…"
                className="!border-none !px-0"
              />
              <kbd className="font-mono-num text-[11px] px-1.5 py-0.5 rounded border border-[var(--line-strong)] text-[var(--ink-3)] shrink-0">
                ESC
              </kbd>
            </div>

            <Command.List>
              <Command.Empty>没有找到匹配内容</Command.Empty>

              <Command.Group heading="页面直达">
                <Command.Item onSelect={() => jump('#/')}>
                  <span className="flex items-center gap-2.5">
                    <Sparkles size={15} strokeWidth={1.5} /> 今日主线
                  </span>
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">首页</span>
                </Command.Item>
                <Command.Item onSelect={() => jump('#/branches')}>
                  <span className="flex items-center gap-2.5">
                    <Compass size={15} strokeWidth={1.5} /> 七分支技能星图
                  </span>
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">7 分支</span>
                </Command.Item>
                <Command.Item onSelect={() => jump('#/review?tab=cards')}>
                  <span className="flex items-center gap-2.5">
                    <Layers size={15} strokeWidth={1.5} /> 重测与 3D 概念闪卡台
                  </span>
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">
                    {content.knowledgeGraph.nodes.length} 卡
                  </span>
                </Command.Item>
                <Command.Item
                  value="日常省钱与外卖比价台 美团 淘宝 抖音 饿了么 优惠券 团购 联盟 Worker"
                  onSelect={() => jump('#/events')}
                >
                  <span className="flex items-center gap-2.5">
                    <Tag size={15} strokeWidth={1.5} /> 日常省钱与外卖比价台（官方通道 & 实时券源）
                  </span>
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">省钱</span>
                </Command.Item>
                <Command.Item onSelect={() => jump('#/events')}>
                  <span className="flex items-center gap-2.5">
                    <BookOpen size={15} strokeWidth={1.5} /> 生活事件包与工具箱
                  </span>
                </Command.Item>
                <Command.Item onSelect={() => jump('#/lab')}>
                  <span className="flex items-center gap-2.5">
                    <FlaskConical size={15} strokeWidth={1.5} /> 真实任务池与月度实验室
                  </span>
                </Command.Item>
                <Command.Item onSelect={() => jump('#/wall')}>
                  <span className="flex items-center gap-2.5">
                    <Monitor size={15} strokeWidth={1.5} /> 1080P 个人状态墙
                  </span>
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">大屏</span>
                </Command.Item>
              </Command.Group>

              <Command.Group heading={`深度实战手册（全站 ${content.units.length} 篇，支持正文关键词检索）`}>
                {content.units.map((u) => {
                  const fullTextSnippet = u.guide.blocks
                    .map((b) => `${b.heading} ${b.keyTakeaway ?? ''}`)
                    .join(' ');
                  return (
                    <Command.Item
                      key={u.id}
                      value={`${u.branchId} ${u.title} ${u.scenarioHook.sceneTitle} ${fullTextSnippet} ${u.id}`}
                      onSelect={() => jump(`#/unit/${encodeURIComponent(u.id)}`)}
                    >
                      <span className="truncate">{u.title}</span>
                      <span className="font-mono-num text-[12px] text-[var(--ink-3)] shrink-0">
                        {u.branchId} · {u.estimatedMinutes}m
                      </span>
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading="核心概念闪卡">
                {content.knowledgeGraph.nodes.map((node) => (
                  <Command.Item
                    key={node.id}
                    value={`${node.branchId} ${node.label} ${node.plainDefinition}`}
                    onSelect={() => jump('#/review?tab=cards')}
                  >
                    <span className="truncate">{node.label}</span>
                    <span className="font-mono-num text-[12px] text-[var(--ink-3)] shrink-0">
                      {node.branchId}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
