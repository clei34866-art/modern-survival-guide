import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SkillAtlasSvg } from '@/components/SkillTreeSvg';
import { Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Button } from '@/components/ui/primitives';
import type { PlatformContentBundle } from '@/core/contentLoader';
import {
  fetchServerSyncSnapshot,
  getLocalDateKey,
  logDailyLifeHabit,
  saveWallPersonalConfig,
} from '@/core/db';
import { isUnitCleared } from '@/core/gatekeeper';
import { computeWallViewModel } from '@/core/wallAdapter';
import { cn } from '@/lib/utils';
import type {
  GlassClarityMode,
  TelemetrySnapshot,
  WallCountdownItem,
  WallExternalSyncPayload,
} from '@/types/schema';

interface StatusWallViewProps {
  content: PlatformContentBundle;
  telemetry: TelemetrySnapshot;
  initialSubView?: 'main' | 'b1';
  pureView?: boolean;
  onTogglePureView?: () => void;
  onTelemetryChange?: (next: TelemetrySnapshot) => void;
}

function formatClock(date: Date): string {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function formatDateLabel(date: Date): string {
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')} ${weekdays[date.getDay()]}`;
}

export function StatusWallView({
  content,
  telemetry,
  initialSubView = 'main',
  pureView = false,
  onTogglePureView,
  onTelemetryChange,
}: StatusWallViewProps) {
  const [subView, setSubView] = useState<'main' | 'b1'>(initialSubView);
  const [now, setNow] = useState<Date>(() => new Date());
  const [externalSync, setExternalSync] = useState<WallExternalSyncPayload | null>(null);
  const [forcePreviewDemo, setForcePreviewDemo] = useState<boolean>(false);

  // Gen-2 R1：右侧状态墙个人配置 Drawer
  const [configOpen, setConfigOpen] = useState<boolean>(false);
  const [configTab, setConfigTab] = useState<'countdowns' | 'life' | 'display'>('countdowns');

  const todayKey = getLocalDateKey(now);
  const personal = telemetry.wallPersonal;
  const todayLife = telemetry.dailyLifeLogs?.[todayKey];
  const autoRotateSeconds = personal?.autoRotateSeconds ?? 0;
  const glassClarity: GlassClarityMode = personal?.glassClarity ?? 'clear';

  // 倒计时新增草稿
  const [newCdLabel, setNewCdLabel] = useState<string>('');
  const [newCdDate, setNewCdDate] = useState<string>('');

  // 生活打卡与吉光草稿
  const [sleepDraft, setSleepDraft] = useState<string>(
    todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : ''
  );
  const [runDraft, setRunDraft] = useState<string>(
    todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : ''
  );
  const [quoteDraft, setQuoteDraft] = useState<string>(personal?.quote ?? '');
  const [movieDraft, setMovieDraft] = useState<string>(personal?.movie ?? '');
  const [weatherDraft, setWeatherDraft] = useState<string>(personal?.weatherNote ?? '');

  useEffect(() => {
    setSubView(initialSubView);
  }, [initialSubView]);

  useEffect(() => {
    setSleepDraft(todayLife?.sleepHours !== undefined ? String(todayLife.sleepHours) : '');
    setRunDraft(todayLife?.runningKm !== undefined ? String(todayLife.runningKm) : '');
  }, [todayLife?.sleepHours, todayLife?.runningKm]);

  useEffect(() => {
    setQuoteDraft(personal?.quote ?? '');
    setMovieDraft(personal?.movie ?? '');
    setWeatherDraft(personal?.weatherNote ?? '');
  }, [personal?.quote, personal?.movie, personal?.weatherNote]);

  useEffect(() => {
    const clockTimer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  // 六宫格 ⇄ B1 专项看板自动轮播（配置抽屉打开或纯净观景时暂停）
  useEffect(() => {
    if (!autoRotateSeconds || configOpen || pureView) return;
    const timer = setInterval(() => {
      setSubView((prev) => (prev === 'main' ? 'b1' : 'main'));
    }, autoRotateSeconds * 1000);
    return () => clearInterval(timer);
  }, [autoRotateSeconds, configOpen, pureView]);

  useEffect(() => {
    let active = true;
    const pullExternal = () => {
      fetchServerSyncSnapshot(content.wallConfig.externalSyncUrl).then((payload) => {
        if (active && payload) setExternalSync(payload);
      });
    };
    pullExternal();
    const refreshMs = Math.max(15, content.wallConfig.refreshIntervalSeconds) * 1000;
    const syncTimer = setInterval(pullExternal, refreshMs);
    return () => {
      active = false;
      clearInterval(syncTimer);
    };
  }, [content.wallConfig.externalSyncUrl, content.wallConfig.refreshIntervalSeconds]);

  const vm = computeWallViewModel(
    content,
    telemetry,
    externalSync,
    todayKey,
    forcePreviewDemo ? 'DEMO' : undefined
  );

  const currentCountdowns: WallCountdownItem[] =
    personal?.countdowns && personal.countdowns.length > 0
      ? personal.countdowns
      : content.wallConfig.countdowns;

  const handleQuickWater = async (delta: number) => {
    const next = await logDailyLifeHabit({ waterDelta: delta }, todayKey);
    onTelemetryChange?.(next);
    const cups = next.dailyLifeLogs?.[todayKey]?.waterCups ?? 0;
    const goal = next.dailyLifeLogs?.[todayKey]?.waterGoal ?? 8;
    toast.success(`已记录喝水：${cups} / ${goal} 杯`);
  };

  const handleAddCountdown = async () => {
    if (!newCdLabel.trim() || !newCdDate) return;
    const baseList = personal?.countdowns ? [...personal.countdowns] : [];
    const nextList: WallCountdownItem[] = [
      ...baseList,
      {
        id: `cd_${Date.now()}`,
        label: newCdLabel.trim(),
        targetDate: newCdDate,
        isSample: false,
      },
    ];
    const next = await saveWallPersonalConfig({ countdowns: nextList });
    onTelemetryChange?.(next);
    setNewCdLabel('');
    setNewCdDate('');
    toast.success('已添加真实倒计时节点');
  };

  const handleRemoveCountdown = async (id: string) => {
    const nextList = currentCountdowns.filter((c) => c.id !== id);
    const next = await saveWallPersonalConfig({ countdowns: nextList });
    onTelemetryChange?.(next);
    toast('已移除倒计时节点');
  };

  const handleSaveLifeAndContent = async () => {
    const sleepNum = sleepDraft.trim() === '' ? null : Number(sleepDraft);
    const runNum = runDraft.trim() === '' ? null : Number(runDraft);
    await logDailyLifeHabit(
      {
        sleepHours: sleepNum !== null && !Number.isNaN(sleepNum) ? sleepNum : null,
        runningKm: runNum !== null && !Number.isNaN(runNum) ? runNum : null,
      },
      todayKey
    );
    const next = await saveWallPersonalConfig({
      quote: quoteDraft.trim() || undefined,
      movie: movieDraft.trim() || undefined,
      weatherNote: weatherDraft.trim() || undefined,
    });
    onTelemetryChange?.(next);
    toast.success('已保存今日生活打卡与状态墙吉光');
  };

  const handleSetRotate = async (secs: 0 | 30 | 60) => {
    const next = await saveWallPersonalConfig({ autoRotateSeconds: secs });
    onTelemetryChange?.(next);
    toast(secs === 0 ? '已关闭自动轮播' : `已开启每 ${secs} 秒自动轮播`);
  };

  const handleSetClarity = async (mode: GlassClarityMode) => {
    const next = await saveWallPersonalConfig({ glassClarity: mode });
    onTelemetryChange?.(next);
    toast(`玻璃通透度已切至：${mode === 'clear' ? '清透' : mode === 'regular' ? '标准' : '深读'}`);
  };

  const totalDualMinutes = Math.max(
    1,
    vm.b1Kanban.aiLineMinutes + vm.b1Kanban.softwareLineMinutes
  );
  const aiRatioPercent = Math.round((vm.b1Kanban.aiLineMinutes / totalDualMinutes) * 100);
  const swRatioPercent = 100 - aiRatioPercent;

  const b1Branch = content.catalog.branches.find((b) => b.id === 'B1');
  const swPacks = (b1Branch?.tracks ?? []).filter((t) => t.kind === 'software_pack');

  const ringR = 34;
  const ringC = 2 * Math.PI * ringR;
  const ringOffset = ringC * (1 - vm.learning.todayPercent / 100);

  const configDrawer = (
    <Drawer
      open={configOpen}
      onOpenChange={setConfigOpen}
      title="1080P 状态墙个人配置"
      description="所有倒计时、生活打卡与显示选项仅存本机浏览器，实时同步主站与周报"
      widthClassName="w-[min(480px,94vw)]"
    >
      <div className="space-y-4">
        <div className="glass-plate grid grid-cols-3 gap-1 p-1" role="tablist">
          {(
            [
              { id: 'countdowns', label: '真实倒计时' },
              { id: 'life', label: '打卡与吉光' },
              { id: 'display', label: '轮播与通透' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={configTab === t.id}
              onClick={() => setConfigTab(t.id)}
              className={cn(
                'min-h-[34px] cursor-pointer rounded-[8px] text-[13px] font-medium transition-colors',
                configTab === t.id
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {configTab === 'countdowns' && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">新增真实倒计时</div>
              <input
                type="text"
                className="v3-input text-[14px]"
                placeholder="如：大创中期答辩 / 期末考试 / 马拉松"
                value={newCdLabel}
                onChange={(e) => setNewCdLabel(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  className="v3-input font-mono-num flex-1 text-[13.5px]"
                  value={newCdDate}
                  onChange={(e) => setNewCdDate(e.target.value)}
                />
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!newCdLabel.trim() || !newCdDate}
                  onClick={handleAddCountdown}
                >
                  <Plus size={14} strokeWidth={1.7} />
                  <span>添加</span>
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-[12.5px] text-[var(--ink-3)]">
                当前展示列表（大屏固定展示前 3 项，零滚屏）
              </div>
              {currentCountdowns.map((cd) => (
                <div
                  key={cd.id}
                  className="glass-plate flex items-center justify-between gap-2 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[14px] font-medium text-[var(--ink-1)]">
                      {cd.label}
                    </div>
                    <div className="font-mono-num text-[12px] text-[var(--ink-3)]">
                      {cd.targetDate}
                      {cd.isSample ? ' · 默认示例' : ''}
                    </div>
                  </div>
                  <Popconfirm
                    title={`删除「${cd.label}」？`}
                    confirmLabel="删除"
                    tone="danger"
                    onConfirm={() => handleRemoveCountdown(cd.id)}
                  >
                    <Button size="sm" variant="danger" aria-label={`删除倒计时：${cd.label}`}>
                      <Trash2 size={13} strokeWidth={1.6} />
                    </Button>
                  </Popconfirm>
                </div>
              ))}
            </div>
          </div>
        )}

        {configTab === 'life' && (
          <div className="space-y-4">
            <div className="glass-plate space-y-3 p-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                  今日饮水：{vm.lifeBlock.waterCupsToday} / {vm.lifeBlock.waterGoalToday} 杯
                </span>
                <div className="flex items-center gap-1.5">
                  <Button size="sm" variant="subtle" onClick={() => handleQuickWater(-1)}>
                    -1
                  </Button>
                  <Button size="sm" variant="growth" onClick={() => handleQuickWater(1)}>
                    +1 杯
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                  <span>昨夜睡眠（小时）</span>
                  <input
                    type="number"
                    step="0.5"
                    className="v3-input font-mono-num text-[13.5px]"
                    placeholder="如 7.5"
                    value={sleepDraft}
                    onChange={(e) => setSleepDraft(e.target.value)}
                  />
                </label>
                <label className="space-y-1 text-[12px] text-[var(--ink-2)]">
                  <span>今日跑步（km）</span>
                  <input
                    type="number"
                    step="0.5"
                    className="v3-input font-mono-num text-[13.5px]"
                    placeholder="如 5.0"
                    value={runDraft}
                    onChange={(e) => setRunDraft(e.target.value)}
                  />
                </label>
              </div>
            </div>

            <div className="glass-plate space-y-3 p-4">
              <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>今日天气 / 城市简标</span>
                <input
                  type="text"
                  className="v3-input text-[13.5px]"
                  placeholder="如：晴 · 21°C · 书桌模式"
                  value={weatherDraft}
                  onChange={(e) => setWeatherDraft(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>今日吉光一句</span>
                <textarea
                  rows={2}
                  className="v3-textarea text-[13.5px]"
                  placeholder="写一句想挂在副屏上提醒自己的话…"
                  value={quoteDraft}
                  onChange={(e) => setQuoteDraft(e.target.value)}
                />
              </label>
              <label className="block space-y-1 text-[12px] text-[var(--ink-2)]">
                <span>近期想看的电影 / 书单</span>
                <input
                  type="text"
                  className="v3-input text-[13.5px]"
                  placeholder="如：《白日梦想家》· 周末待看"
                  value={movieDraft}
                  onChange={(e) => setMovieDraft(e.target.value)}
                />
              </label>
              <div className="flex justify-end">
                <Button size="sm" variant="primary" onClick={handleSaveLifeAndContent}>
                  保存打卡与吉光
                </Button>
              </div>
            </div>
          </div>
        )}

        {configTab === 'display' && (
          <div className="space-y-4">
            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">
                六宫格 ⇄ B1 专项看板自动轮播
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { v: 0, label: '关闭轮播' },
                    { v: 30, label: '每 30 秒' },
                    { v: 60, label: '每 60 秒' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.v}
                    type="button"
                    onClick={() => handleSetRotate(item.v)}
                    className={cn(
                      'min-h-[38px] cursor-pointer rounded-[10px] border text-[13px] font-medium transition-colors',
                      autoRotateSeconds === item.v
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                        : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-strong)]'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-plate space-y-2.5 p-4">
              <div className="text-[13px] font-semibold text-[var(--ink-1)]">玻璃面板通透度</div>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { v: 'clear', label: '清透' },
                    { v: 'regular', label: '标准' },
                    { v: 'frosted', label: '深读' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.v}
                    type="button"
                    onClick={() => handleSetClarity(item.v)}
                    className={cn(
                      'min-h-[38px] cursor-pointer rounded-[10px] border text-[13px] font-medium transition-colors',
                      glassClarity === item.v
                        ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                        : 'border-[var(--line)] text-[var(--ink-2)] hover:border-[var(--line-strong)]'
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );

  // ============================================================================
  // 二级切换子视图：B1 AI 与软件专项数字看板
  // ============================================================================
  if (subView === 'b1') {
    return (
      <div className="wall-viewport" aria-label="1080P B1 AI与软件专项数字看板（二级视图）">
        {configDrawer}
        <div className="wall-b1-subview">
          <header className="wall-b1-topbar">
            <div className="wall-b1-topbar-group">
              <button type="button" className="wall-btn" onClick={() => setSubView('main')}>
                <ArrowLeft size={14} strokeWidth={1.6} />
                <span>返回六宫格个人状态墙</span>
              </button>
              <h1 className="wall-panel-title">
                <span className="wall-dot" />
                B1 · AI 与软件专项数字看板
              </h1>
            </div>
            <div className="wall-b1-topbar-group">
              {autoRotateSeconds > 0 && (
                <span className="wall-tag">
                  <RefreshCw size={11} strokeWidth={1.7} />
                  {autoRotateSeconds}s 轮播中
                </span>
              )}
              <span
                className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? 'LIVE 真实留痕' : 'DEMO 示例演示'}
              </span>
              <span className="wall-tag font-mono-num">{formatClock(now)}</span>
              <a href="#/" className="wall-btn no-underline">
                返回站内
              </a>
            </div>
          </header>

          <div className="wall-b1-kpis">
            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">AI 五层路径总进度</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.b1Kanban.fiveLayerOverallPercent}%
              </div>
              <div className="wall-kpi-foot">逐层过关 + 实战项目验收</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">当前层级与产出完成度</div>
              <div className="wall-kpi-mid-title">{vm.b1Kanban.currentLayerTitle}</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-amber)' }}>
                {vm.b1Kanban.currentDeliverablePercent}%
              </div>
              <div className="wall-kpi-foot">产出：{vm.b1Kanban.currentDeliverableTitle}</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">连续 / 累计点亮天数</div>
              <div className="wall-kpi-hero">
                {vm.learning.consecutiveDays}
                <span className="wall-kpi-unit"> 连续 · 共 {vm.learning.activeDaysTotal} 天</span>
              </div>
              <div className="wall-kpi-foot">正向累积 · 断更不清零</div>
            </div>

            <div className="wall-panel wall-kpi-card">
              <div className="wall-kpi-sub">今日流程完成情况</div>
              <div className="wall-kpi-hero" style={{ color: 'var(--wall-green)' }}>
                {vm.learning.todayDone}/{vm.learning.todayTotal}
              </div>
              <div className="wall-kpi-foot">完成率 {vm.learning.todayPercent}%（做完即停）</div>
            </div>
          </div>

          <section className="wall-panel wall-b1-layers">
            <div className="wall-panel-head">
              <h2 className="wall-panel-title">AI 能力线 L1–L5 各层掌握度与产出矩阵</h2>
              <span className="wall-tag">按答题与单元过关聚合</span>
            </div>
            <div className="wall-layers-stack">
              {vm.b1Kanban.layers.map((layer) => (
                <div className="wall-layer-row" key={layer.trackId}>
                  <strong className="wall-layer-code">{layer.shortLabel}</strong>
                  <div className="wall-layer-info">
                    <div className="wall-layer-name">{layer.title.replace(/^AI L\d · /, '')}</div>
                    <div className="wall-layer-meta">
                      掌握度 {layer.masteryPercent}% · 实战产出 {layer.deliverablePercent}%
                    </div>
                  </div>
                  <div className="wall-bar-track is-thick">
                    <div
                      className="wall-bar-fill"
                      style={{
                        width: `${Math.max(4, layer.masteryPercent)}%`,
                        backgroundColor: layer.unlocked ? '#5ea8ff' : '#3a424d',
                      }}
                    />
                  </div>
                  <span className={`wall-tag ${layer.isCleared ? 'wall-tag-live' : ''}`}>
                    {layer.isCleared ? '已过关' : layer.unlocked ? '当前可学' : '待解锁'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="wall-panel wall-b1-duration">
            <div className="wall-panel-head">
              <h2 className="wall-panel-title">双线投入时长与软件技能分包</h2>
              <span className="wall-tag">精确留痕聚合</span>
            </div>

            <div className="wall-dual-bars">
              <div className="wall-dual-item">
                <div className="wall-dual-label-row">
                  <span className="wall-dual-name">AI 能力线（L1–L5）</span>
                  <strong className="wall-dual-val font-mono-num">
                    {vm.b1Kanban.aiLineMinutes} min（{aiRatioPercent}%）
                  </strong>
                </div>
                <div className="wall-bar-track is-xl">
                  <div
                    className="wall-bar-fill"
                    style={{ width: `${Math.max(6, aiRatioPercent)}%`, backgroundColor: '#5ea8ff' }}
                  />
                </div>
              </div>

              <div className="wall-dual-item">
                <div className="wall-dual-label-row">
                  <span className="wall-dual-name">软件技能线（Blender / Git 等）</span>
                  <strong className="wall-dual-val font-mono-num">
                    {vm.b1Kanban.softwareLineMinutes} min（{swRatioPercent}%）
                  </strong>
                </div>
                <div className="wall-bar-track is-xl">
                  <div
                    className="wall-bar-fill"
                    style={{ width: `${Math.max(6, swRatioPercent)}%`, backgroundColor: '#5eead4' }}
                  />
                </div>
              </div>
            </div>

            <div className="wall-sw-packs-strip">
              <div className="wall-kpi-sub" style={{ marginBottom: '8px' }}>
                软件技能分包状态（按需即学即用）
              </div>
              <div className="wall-sw-grid">
                {swPacks.map((pack) => {
                  const total = pack.unitIds.length;
                  const cleared = pack.unitIds.filter((uid) => isUnitCleared(uid, telemetry)).length;
                  return (
                    <div className="wall-sw-chip" key={pack.id}>
                      <span className="wall-sw-chip-name">
                        {pack.title.replace(/^软件包 S\d · /, '')}
                      </span>
                      <span className="wall-sw-chip-stat font-mono-num">
                        {`${cleared}/${total} 节`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="wall-weakness-box">
              <div className="wall-kpi-sub">薄弱概念 TOP 5（待 1/3/7 天重测）</div>
              <div className="wall-weakness-items">
                {vm.learning.weaknessTop5.length === 0 ? (
                  <span className="wall-kpi-sub">当前无积压错题</span>
                ) : (
                  vm.learning.weaknessTop5.map((w) => (
                    <span className="wall-weak-chip" key={w.label}>
                      [{w.branchId}] {w.label}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 默认主视图：1080P 全站个人状态墙六宫格 + 底部 36px 极简状态条
  // ============================================================================
  return (
    <div className="wall-viewport" aria-label="1080P 个人状态墙六宫格主视图">
      {configDrawer}

      {pureView && onTogglePureView && (
        <div className="fixed top-4 right-4 z-50">
          <button type="button" className="wall-btn" onClick={onTogglePureView}>
            <EyeOff size={14} strokeWidth={1.6} />
            <span>退出纯净观景 (ESC)</span>
          </button>
        </div>
      )}

      <div
        className="wall-bento-grid"
        style={{
          opacity: pureView ? 0 : 1,
          pointerEvents: pureView ? 'none' : 'auto',
          transition: 'opacity 280ms ease',
        }}
      >
        {/* [1] 今日总览 */}
        <section className="wall-panel wall-panel-today" aria-label="今日总览">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" />
              今日总览
            </h2>
            <span className="wall-tag">{vm.weather}</span>
          </div>

          <div className="wall-today-hero">
            <div>
              <div className="wall-clock">{formatClock(now)}</div>
              <div className="wall-date-weather">{formatDateLabel(now)}</div>
            </div>
            <Tooltip content={`今日已完成 ${vm.learning.todayPercent}%`} side="top">
              <div className="wall-ring-wrap">
                <svg width="84" height="84" viewBox="0 0 84 84">
                  <circle
                    cx="42"
                    cy="42"
                    r={ringR}
                    fill="none"
                    stroke="rgba(190, 222, 255, 0.16)"
                    strokeWidth="7"
                  />
                  <circle
                    cx="42"
                    cy="42"
                    r={ringR}
                    fill="none"
                    stroke="#5eead4"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={ringC}
                    strokeDashoffset={ringOffset}
                    transform="rotate(-90 42 42)"
                  />
                  <text
                    x="42"
                    y="40"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="600"
                    fontFamily="var(--font-mono)"
                    fill="#f4f8ff"
                  >
                    {vm.learning.todayDone}/{vm.learning.todayTotal}
                  </text>
                  <text x="42" y="55" textAnchor="middle" fontSize="10" fill="#c6d7f0">
                    今日进度
                  </text>
                </svg>
              </div>
            </Tooltip>
          </div>

          <ul className="wall-todo-list">
            {vm.todos.slice(0, 4).map((item, idx) => (
              <li className="wall-todo-item" key={idx}>
                <span className="wall-todo-bullet" />
                <span className="wall-todo-text">{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* [3] 生存指南学习块 */}
        <section className="wall-panel wall-panel-learning" aria-label="生存指南学习块">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" />
              生存指南学习块
            </h2>
            <div className="wall-head-actions">
              <span
                className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}
              >
                {vm.dataMode === 'LIVE' ? 'LIVE' : 'DEMO'}
              </span>
              <Tooltip content="切换查看 B1 AI 与软件专项数字看板" side="bottom">
                <button type="button" className="wall-btn" onClick={() => setSubView('b1')}>
                  <span>B1 专项看板</span>
                  <ArrowRight size={13} strokeWidth={1.6} />
                </button>
              </Tooltip>
            </div>
          </div>

          <div className="wall-learning-body">
            <div className="wall-tree-summary-col">
              <div className="wall-kpi-sub">七分支技能星图</div>
              <SkillAtlasSvg
                content={content}
                telemetry={telemetry}
                variant="wall"
                demoFallback={vm.dataMode === 'DEMO'}
              />
              <div className="wall-tree-metrics">
                <div className="wall-big-kpi font-mono-num">{vm.learning.activeDaysTotal}</div>
                <div className="wall-kpi-sub">
                  累计点亮（连学 {vm.learning.consecutiveDays} 天）
                </div>
                <div className="wall-dual-mini font-mono-num">
                  AI {vm.b1Kanban.aiLineMinutes}m · 软件 {vm.b1Kanban.softwareLineMinutes}m
                </div>
              </div>
            </div>

            <div className="wall-branches-col">
              <div className="wall-branch-bars">
                {vm.learning.branchProgress.map((bp) => (
                  <div className="wall-bar-row" key={bp.id}>
                    <span className="wall-bar-name">
                      {bp.id} {bp.name.slice(0, 2)}
                    </span>
                    <div className="wall-bar-track is-thick">
                      <div
                        className="wall-bar-fill"
                        style={{
                          width: `${Math.max(4, bp.percent)}%`,
                          backgroundColor: bp.accentToken,
                        }}
                      />
                    </div>
                    <span className="wall-bar-pct font-mono-num">{bp.percent}%</span>
                  </div>
                ))}
              </div>

              <div className="wall-weakness-box">
                <div className="wall-tip-inline">
                  <span className="wall-tip-tag">每日一招</span>
                  <span className="wall-tip-title">{vm.learning.dailyTipTitle}</span>
                </div>
                <div className="wall-weakness-items">
                  {vm.learning.weaknessTop5.length === 0 ? (
                    <span className="wall-kpi-sub">暂无错题积压 · 今日状态稳健</span>
                  ) : (
                    vm.learning.weaknessTop5.slice(0, 3).map((w) => (
                      <span className="wall-weak-chip" key={w.label}>
                        {w.branchId} · {w.label}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* [2] 关键节点倒计时块 */}
        <section className="wall-panel wall-panel-countdown" aria-label="关键节点倒计时">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" style={{ background: 'var(--wall-amber)' }} />
              关键节点
            </h2>
            <span className="wall-tag">
              {personal?.countdowns && personal.countdowns.length > 0 ? '个人节点' : '倒计时'}
            </span>
          </div>
          <div className="wall-countdown-stack">
            {vm.countdowns.slice(0, 3).map((cd) => {
              const urgencyPct = Math.max(
                8,
                Math.min(100, Math.round(100 - Math.min(cd.daysLeft, 365) / 3.65))
              );
              return (
                <div className="wall-cd-card" key={cd.id}>
                  <div className="wall-cd-top">
                    <div>
                      <div className="wall-cd-label">{cd.label}</div>
                      <div className="wall-cd-date font-mono-num">{cd.targetDate}</div>
                    </div>
                    <div className={`wall-cd-days font-mono-num ${cd.isUrgent ? 'is-urgent' : ''}`}>
                      {cd.daysLeft}
                      <span>天</span>
                    </div>
                  </div>
                  <div className="wall-cd-bar">
                    <div
                      className="wall-cd-bar-fill"
                      style={{
                        width: `${urgencyPct}%`,
                        backgroundColor: cd.isUrgent ? 'var(--wall-coral)' : 'var(--wall-amber)',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* [4] 生活节律与实验（支持大屏一键 +1 喝水打卡） */}
        <section className="wall-panel wall-panel-life" aria-label="生活节律与实验">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">
              <span className="wall-dot" />
              生活节律与实验
            </h2>
            <span
              data-testid="wall-life-source-tag"
              className={`wall-tag ${vm.lifeBlock.sourceLabel === '个人打卡' ? 'wall-tag-live' : ''}`}
            >
              {vm.lifeBlock.sourceLabel}
            </span>
          </div>
          <div className="wall-life-grid-2x2">
            <div className="wall-micro-tile">
              <span className="wall-micro-label">跑步习惯</span>
              <strong className="wall-micro-val">{vm.lifeBlock.running}</strong>
            </div>
            <div className="wall-micro-tile">
              <span className="wall-micro-label">睡眠复盘</span>
              <strong className="wall-micro-val">{vm.lifeBlock.sleep}</strong>
            </div>
            <div className="wall-micro-tile">
              <div className="flex items-center justify-between gap-2">
                <span className="wall-micro-label">饮水节律</span>
                <Tooltip content="顺手记一杯水，实时同步周报" side="top">
                  <button
                    type="button"
                    data-testid="wall-water-plus-btn"
                    className="wall-water-plus-btn"
                    onClick={() => handleQuickWater(1)}
                  >
                    +1 杯
                  </button>
                </Tooltip>
              </div>
              <strong className="wall-micro-val" data-testid="wall-water-val">
                {vm.lifeBlock.water}
              </strong>
            </div>
            <div className="wall-micro-tile is-accent-tile">
              <span className="wall-micro-label">月度生活实验</span>
              <strong className="wall-micro-val">{vm.lifeBlock.experimentLine}</strong>
            </div>
          </div>
        </section>

        {/* [6] 服务与数据状态 */}
        <section className="wall-panel wall-panel-status" aria-label="服务与数据状态">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">服务与数据状态</h2>
            <span className="wall-tag">
              {autoRotateSeconds > 0
                ? `每 ${autoRotateSeconds}s 轮播`
                : `每 ${content.wallConfig.refreshIntervalSeconds}s 刷新`}
            </span>
          </div>
          <div className="wall-status-two-col">
            <div className="wall-micro-tile">
              <span className="wall-micro-label">服务器运行态</span>
              <strong className="wall-micro-val">{vm.statusBlock.serverExpiry}</strong>
            </div>
            <div className="wall-micro-tile">
              <span className="wall-micro-label">本地数据通道</span>
              <strong className="wall-micro-val">{vm.statusBlock.cloudSync}</strong>
            </div>
          </div>
        </section>

        {/* [5] 今日吉光 */}
        <section className="wall-panel wall-panel-content" aria-label="今日吉光">
          <div className="wall-panel-head">
            <h2 className="wall-panel-title">今日吉光</h2>
            <span className="wall-tag">{vm.contentBlock.sourceLabel}</span>
          </div>
          <div className="wall-quote-body">
            <p className="wall-quote-text">{vm.contentBlock.quote}</p>
          </div>
          <div className="wall-movie-foot">{vm.contentBlock.movie}</div>
        </section>
      </div>

      {/* 底部极简 36px 细系统状态栏 */}
      <footer
        className="wall-slim-footer"
        aria-label="状态墙控制栏"
        style={{
          opacity: pureView ? 0 : 1,
          pointerEvents: pureView ? 'none' : 'auto',
          transition: 'opacity 280ms ease',
        }}
      >
        <div className="wall-slim-footer-left">
          <span className={`wall-tag ${vm.dataMode === 'LIVE' ? 'wall-tag-live' : 'wall-tag-demo'}`}>
            {vm.dataMode === 'LIVE' ? 'LIVE 真实留痕驱动' : 'DEMO 示例数据演示'}
          </span>
          <span className="wall-kpi-sub">现代必备生存指南 · 常亮状态墙</span>
        </div>
        <div className="wall-slim-footer-right">
          <Tooltip content="编辑个人倒计时、生活打卡、轮播与玻璃通透度" side="top">
            <button
              type="button"
              className="wall-btn"
              data-testid="wall-config-drawer-trigger"
              onClick={() => setConfigOpen(true)}
            >
              <SlidersHorizontal size={13} strokeWidth={1.6} />
              <span>配置</span>
            </button>
          </Tooltip>
          {onTogglePureView && (
            <Tooltip content="收起全部面板欣赏 Wave 星空海面" side="top">
              <button type="button" className="wall-btn" onClick={onTogglePureView}>
                <Eye size={13} strokeWidth={1.6} />
                <span>纯净观景</span>
              </button>
            </Tooltip>
          )}
          <button
            type="button"
            className="wall-btn"
            onClick={() => setForcePreviewDemo((v) => !v)}
          >
            {forcePreviewDemo ? '恢复实况判定' : '预览 DEMO 态'}
          </button>
          <a href="#/" className="wall-btn no-underline">
            <ArrowLeft size={13} strokeWidth={1.6} />
            <span>返回站内</span>
          </a>
        </div>
      </footer>
    </div>
  );
}
