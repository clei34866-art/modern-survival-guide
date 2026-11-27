import {
  AlertTriangle,
  BookmarkPlus,
  CalendarDays,
  CheckCircle2,
  Copy,
  ExternalLink,
  Plug,
  RefreshCw,
  Scale,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Drawer, Popconfirm, Tooltip } from '@/components/ui/overlays';
import { Badge, Button } from '@/components/ui/primitives';
import {
  CURATED_SAVING_CHANNELS,
  type DealPlatform,
  type DealsHubStorage,
  type LiveDealItem,
  type LiveDealsFeedPayload,
  loadDealsHubStorage,
  PLATFORM_META,
  type PersonalCouponCode,
  saveDealsHubStorage,
  WEEKDAY_SAVING_CALENDAR,
  WORKER_JSON_EXAMPLE,
} from '@/data/dealsHub';
import { cn } from '@/lib/utils';

type DealsTab = 'channels' | 'compare' | 'pocket';

interface PlatformOrderInput {
  id: 'meituan' | 'eleme' | 'douyin';
  label: string;
  color: string;
  subtotal: number;
  discount: number;
  delivery: number;
  packing: number;
}

const COMPARE_PRESETS: Array<{
  id: string;
  label: string;
  rows: PlatformOrderInput[];
}> = [
  {
    id: 'lunch',
    label: '单人工作餐',
    rows: [
      { id: 'meituan', label: '美团外卖', color: '#f5b841', subtotal: 34, discount: 10, delivery: 3.5, packing: 3 },
      { id: 'eleme', label: '饿了么 / 闪购', color: '#38bdf8', subtotal: 34, discount: 12, delivery: 4, packing: 3.5 },
      { id: 'douyin', label: '抖音团购 / 到店', color: '#f472b6', subtotal: 24.9, discount: 3, delivery: 0, packing: 0 },
    ],
  },
  {
    id: 'tea',
    label: '双人奶茶甜品',
    rows: [
      { id: 'meituan', label: '美团外卖', color: '#f5b841', subtotal: 38, discount: 8, delivery: 3, packing: 2 },
      { id: 'eleme', label: '饿了么 / 闪购', color: '#38bdf8', subtotal: 38, discount: 11, delivery: 2.5, packing: 2 },
      { id: 'douyin', label: '抖音团购 / 到店', color: '#f472b6', subtotal: 29.9, discount: 2, delivery: 0, packing: 0 },
    ],
  },
  {
    id: 'supper',
    label: '周末聚餐夜宵',
    rows: [
      { id: 'meituan', label: '美团外卖', color: '#f5b841', subtotal: 88, discount: 22, delivery: 5, packing: 6 },
      { id: 'eleme', label: '饿了么 / 闪购', color: '#38bdf8', subtotal: 88, discount: 25, delivery: 6, packing: 6 },
      { id: 'douyin', label: '抖音团购 / 到店', color: '#f472b6', subtotal: 69, discount: 5, delivery: 0, packing: 0 },
    ],
  },
];

function isAllowedFeedUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function isSafeHttpUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

function validateFeedPayload(data: unknown): LiveDealsFeedPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('接口返回的不是有效的 JSON 对象');
  }
  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.items)) {
    throw new Error('返回 JSON 缺少 items 数组字段');
  }
  const normalizedItems: LiveDealItem[] = obj.items
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .slice(0, 40)
    .map((item, idx) => ({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `live-${idx + 1}`,
      platform: typeof item.platform === 'string' && item.platform.trim() ? item.platform.trim() : 'meituan',
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '优惠券项',
      merchant: typeof item.merchant === 'string' ? item.merchant.trim() : undefined,
      discountBadge:
        typeof item.discountBadge === 'string' && item.discountBadge.trim()
          ? item.discountBadge.trim()
          : '限时优惠',
      finalPrice: typeof item.finalPrice === 'number' && !Number.isNaN(item.finalPrice) ? item.finalPrice : undefined,
      originalPrice:
        typeof item.originalPrice === 'number' && !Number.isNaN(item.originalPrice)
          ? item.originalPrice
          : undefined,
      minSpend: typeof item.minSpend === 'string' ? item.minSpend.trim() : undefined,
      promoCode: typeof item.promoCode === 'string' ? item.promoCode.trim() : undefined,
      url: typeof item.url === 'string' && isSafeHttpUrl(item.url) ? item.url.trim() : undefined,
      expiresAt: typeof item.expiresAt === 'string' ? item.expiresAt.trim() : undefined,
      note: typeof item.note === 'string' ? item.note.trim() : undefined,
    }));

  return {
    updatedAt:
      typeof obj.updatedAt === 'string' && obj.updatedAt.trim()
        ? obj.updatedAt.trim()
        : new Date().toISOString(),
    sourceName:
      typeof obj.sourceName === 'string' && obj.sourceName.trim()
        ? obj.sourceName.trim()
        : '个人联盟实时券源',
    items: normalizedItems,
  };
}

function formatShortTime(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mi = String(dt.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

export function DealsSavingsHub() {
  const [storage, setStorage] = useState<DealsHubStorage>(() => loadDealsHubStorage());
  const [activeTab, setActiveTab] = useState<DealsTab>('channels');
  const [platformFilter, setPlatformFilter] = useState<DealPlatform | 'all'>('all');

  // 实时券源配置 Drawer
  const [configOpen, setConfigOpen] = useState(false);
  const [urlDraft, setUrlDraft] = useState<string>(storage.feedUrl);
  const [syncing, setSyncing] = useState(false);

  // 外卖/团购实付比价器
  const [presetId, setPresetId] = useState<string>('lunch');
  const [compareRows, setCompareRows] = useState<PlatformOrderInput[]>(COMPARE_PRESETS[0].rows);

  // 我的口令夹与周历
  const todayWeekday = new Date().getDay();
  const [selectedWeekday, setSelectedWeekday] = useState<number>(todayWeekday);
  const [newCodePlatform, setNewCodePlatform] = useState<DealPlatform>('meituan');
  const [newCodeTitle, setNewCodeTitle] = useState('');
  const [newCodeValue, setNewCodeValue] = useState('');
  const [newCodeNote, setNewCodeNote] = useState('');

  const updateStorage = (next: DealsHubStorage) => {
    setStorage(next);
    saveDealsHubStorage(next);
  };

  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制：${label}`);
    } catch {
      toast(`请手动复制：${text}`);
    }
  };

  const fetchLiveFeed = async (targetUrl: string) => {
    const trimmed = targetUrl.trim();
    if (!isAllowedFeedUrl(trimmed)) {
      toast.error('请填写有效的 https:// 实时券源地址（本地调试允许 http://localhost）');
      return;
    }
    setSyncing(true);
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(trimmed, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`远端返回 HTTP ${res.status}`);
      }
      const json: unknown = await res.json();
      const valid = validateFeedPayload(json);
      updateStorage({
        ...storage,
        feedUrl: trimmed,
        cachedFeed: valid,
      });
      toast.success(`已同步「${valid.sourceName}」，共 ${valid.items.length} 条实时券`);
    } catch (err) {
      const msg =
        err instanceof Error && err.name === 'AbortError'
          ? '连接超时（超过 10 秒），请检查 Worker 地址或网络'
          : err instanceof Error
            ? err.message
            : '拉取失败，请检查 CORS 响应头与 JSON 格式';
      toast.error(`同步未成功：${msg}`);
    } finally {
      window.clearTimeout(timer);
      setSyncing(false);
    }
  };

  const handleDisconnectFeed = () => {
    setUrlDraft('');
    updateStorage({
      ...storage,
      feedUrl: '',
      cachedFeed: undefined,
    });
    toast('已断开外部券源并清空缓存');
  };

  const filteredChannels = useMemo(() => {
    if (platformFilter === 'all') return CURATED_SAVING_CHANNELS;
    return CURATED_SAVING_CHANNELS.filter((c) => c.platform === platformFilter);
  }, [platformFilter]);

  const compareAnalysis = useMemo(() => {
    const computed = compareRows.map((row) => {
      const hiddenFees = Math.max(0, row.delivery) + Math.max(0, row.packing);
      const net = Math.max(0, Math.round((row.subtotal - row.discount + hiddenFees) * 10) / 10);
      const feeRatio = net > 0 ? Math.round((hiddenFees / net) * 100) : 0;
      const highFeeTrap = hiddenFees >= 6 || feeRatio >= 22;
      return { ...row, hiddenFees, net, feeRatio, highFeeTrap };
    });
    const sorted = [...computed].sort((a, b) => a.net - b.net);
    const cheapest = sorted[0];
    const priciest = sorted[sorted.length - 1];
    const spread =
      cheapest && priciest ? Math.max(0, Math.round((priciest.net - cheapest.net) * 10) / 10) : 0;
    return { computed, cheapest, priciest, spread };
  }, [compareRows]);

  const monthKey = new Date().toISOString().slice(0, 7);
  const monthlySavedTotal = useMemo(() => {
    return (
      Math.round(
        storage.ledger
          .filter((item) => item.dateKey.startsWith(monthKey))
          .reduce((acc, item) => acc + item.savedYuan, 0) * 10
      ) / 10
    );
  }, [storage.ledger, monthKey]);

  const handleRowFieldChange = (
    id: PlatformOrderInput['id'],
    field: 'subtotal' | 'discount' | 'delivery' | 'packing',
    rawVal: string
  ) => {
    const num = Math.max(0, Number(rawVal) || 0);
    setCompareRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: num } : r)));
  };

  const handleLogSaving = () => {
    if (!compareAnalysis.cheapest || compareAnalysis.spread <= 0) {
      toast('三家实付一样，改改价格就能测出差价');
      return;
    }
    const entry = {
      id: `save-${Date.now()}`,
      dateKey: new Date().toISOString().slice(0, 10),
      label: `选「${compareAnalysis.cheapest.label}」比最贵渠道省`,
      savedYuan: compareAnalysis.spread,
    };
    updateStorage({
      ...storage,
      ledger: [entry, ...storage.ledger].slice(0, 60),
    });
    toast.success(`已记入本月省钱小账：+¥${compareAnalysis.spread}`);
  };

  const handleAddPersonalCode = () => {
    if (!newCodeTitle.trim() || !newCodeValue.trim()) {
      toast.error('请填写标题和口令或链接');
      return;
    }
    const item: PersonalCouponCode = {
      id: `code-${Date.now()}`,
      platform: newCodePlatform,
      title: newCodeTitle.trim(),
      codeOrLink: newCodeValue.trim(),
      note: newCodeNote.trim() || undefined,
      createdAt: new Date().toISOString().slice(0, 10),
    };
    updateStorage({
      ...storage,
      personalCodes: [item, ...storage.personalCodes],
    });
    setNewCodeTitle('');
    setNewCodeValue('');
    setNewCodeNote('');
    toast.success('已存入你的随身口令夹');
  };

  const handleDeletePersonalCode = (id: string) => {
    updateStorage({
      ...storage,
      personalCodes: storage.personalCodes.filter((c) => c.id !== id),
    });
    toast('已从口令夹删除');
  };

  const handleClearLedger = () => {
    updateStorage({
      ...storage,
      ledger: [],
    });
    toast('已清空省钱小账记录');
  };

  const activeDayTip =
    WEEKDAY_SAVING_CALENDAR.find((d) => d.weekday === selectedWeekday) ??
    WEEKDAY_SAVING_CALENDAR[0];

  const hasLiveItems = Boolean(storage.cachedFeed && storage.cachedFeed.items.length > 0);

  return (
    <div className="v3-card space-y-5 p-5 sm:p-6" data-testid="deals-savings-hub">
      {/* 右侧抽屉：配置官方联盟 Cloudflare Worker 实时券源 */}
      <Drawer
        open={configOpen}
        onOpenChange={setConfigOpen}
        title="接入个人官方联盟实时券源"
        description="完全合规、零密钥暴露：通过你自己的 Cloudflare Worker 转发官方联盟 Open API 返回只读 JSON"
        widthClassName="w-[min(520px,94vw)]"
      >
        <div className="space-y-4">
          <div className="glass-plate space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                实时券源 JSON 地址
              </span>
              <Badge tone={hasLiveItems ? 'growth' : 'neutral'}>
                {hasLiveItems
                  ? `已同步 ${storage.cachedFeed?.items.length ?? 0} 条`
                  : '未接入外部源'}
              </Badge>
            </div>

            <input
              type="url"
              data-testid="deals-feed-url-input"
              className="v3-input font-mono-num text-[13px]"
              placeholder="https://your-deals-worker.yourname.workers.dev/deals"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  disabled={syncing || !urlDraft.trim()}
                  onClick={() => fetchLiveFeed(urlDraft)}
                >
                  <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
                  <span>{syncing ? '正在拉取…' : '保存并同步实时券'}</span>
                </Button>

                {storage.feedUrl && (
                  <Popconfirm
                    title="断开这个实时券源？"
                    description="将清空已缓存的实时券卡片，恢复只显示内置官方省钱通道。"
                    confirmLabel="断开"
                    tone="warning"
                    onConfirm={handleDisconnectFeed}
                  >
                    <Button size="sm" variant="ghost">
                      断开连接
                    </Button>
                  </Popconfirm>
                )}
              </div>
            </div>
          </div>

          <div className="glass-plate space-y-2.5 p-4 text-[13px] leading-[1.65] text-[var(--ink-2)]">
            <div className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ink-1)]">
              <ShieldCheck size={15} className="text-[var(--growth)]" />
              <span>为什么用 Cloudflare Worker 转发官方联盟 API？</span>
            </div>
            <p className="m-0">
              本站部署在纯静态页面上，绝不绕过平台风控爬虫，也绝不把你的联盟密钥写进浏览器前端。
              本仓库已内置可直接部署的模板文件 workers/coupons-worker.js 与中文说明 workers/README.md：
            </p>
            <ol className="m-0 list-decimal space-y-1.5 pl-5 text-[var(--ink-1)]">
              <li>免费注册美团联盟、淘宝联盟或抖音精选联盟个人账号，取得官方 AppKey</li>
              <li>在 Cloudflare Workers 免费额度部署 workers/coupons-worker.js，把 Key 填在环境变量 Secrets 中</li>
              <li>也可先填 CUSTOM_DEALS_JSON 环境变量立刻体验实时下发，再把 Worker 网址粘贴到上方输入框</li>
            </ol>
          </div>

          <div className="glass-plate space-y-2.5 p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                标准返回 JSON 格式（兼容任意自建接口 / n8n）
              </span>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => handleCopyText(WORKER_JSON_EXAMPLE, '实时券源 JSON 格式')}
              >
                <Copy size={12} />
                <span>复制格式</span>
              </Button>
            </div>
            <pre className="m-0 overflow-x-auto rounded-[10px] border border-[var(--line)] bg-[var(--surface-solid)] p-3 font-mono-num text-[11.5px] leading-[1.55] text-[var(--ink-2)]">
              {WORKER_JSON_EXAMPLE}
            </pre>
          </div>
        </div>
      </Drawer>

      {/* 顶部标题与控制栏 */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[var(--dawn)]">
            <Tag size={13} strokeWidth={1.8} />
            <span>落地生活省钱台 · 官方通道、外卖实付比价与实时券源</span>
          </div>
          <h2 className="m-0 text-[19px] font-semibold tracking-[-0.015em] text-[var(--ink-1)] sm:text-[21px]">
            美团 / 淘宝 / 抖音日常领券防坑与实付比价
          </h2>
          <p className="m-0 text-[13.5px] text-[var(--ink-2)]">
            内置高频官方领券搜词、学生隐藏权益与三平台实付比价器；也支持一键接入你的个人官方联盟 Worker 自动刷实时券
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {monthlySavedTotal > 0 && (
            <Badge tone="growth" className="font-mono-num">
              <Wallet size={12} />
              <span>本月已记省下 ¥{monthlySavedTotal}</span>
            </Badge>
          )}
          <Tooltip content="粘贴你的 Cloudflare Worker 地址，自动同步官方联盟实时券">
            <Button
              size="sm"
              variant={hasLiveItems ? 'growth' : 'outline'}
              data-testid="deals-config-trigger"
              onClick={() => {
                setUrlDraft(storage.feedUrl);
                setConfigOpen(true);
              }}
            >
              <Plug size={13} strokeWidth={1.7} />
              <span>{hasLiveItems ? '实时券源已连' : '配置实时券源'}</span>
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* 三功能 Tab 切换 */}
      <div
        className="glass-plate inline-flex flex-wrap items-center gap-1 p-1"
        role="tablist"
        aria-label="日常省钱功能切换"
      >
        {(
          [
            { id: 'channels', label: '官方领券与实时池', icon: Sparkles },
            { id: 'compare', label: '外卖/团购实付比价', icon: Scale },
            { id: 'pocket', label: '我的口令夹与周历', icon: CalendarDays },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              data-testid={`deals-tab-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium transition-colors',
                active
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--ink-2)] hover:text-[var(--ink-1)]'
              )}
            >
              <Icon size={13} strokeWidth={1.7} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: 实时券池（若已接源） + 内置官方高频省钱清单 */}
      {activeTab === 'channels' && (
        <div className="space-y-4" data-testid="deals-panel-channels">
          {/* 若用户已同步个人 Worker 实时券源，优先置顶展示实时卡片 */}
          {hasLiveItems && storage.cachedFeed && (
            <div className="glass-plate space-y-3 border-[var(--growth-border)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="growth">实时券源已生效</Badge>
                  <span className="text-[13.5px] font-semibold text-[var(--ink-1)]">
                    {storage.cachedFeed.sourceName}
                  </span>
                  <span className="font-mono-num text-[12px] text-[var(--ink-3)]">
                    更新于 {formatShortTime(storage.cachedFeed.updatedAt)}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="subtle"
                  disabled={syncing}
                  onClick={() => fetchLiveFeed(storage.feedUrl)}
                >
                  <RefreshCw size={12} className={cn(syncing && 'animate-spin')} />
                  <span>刷新实时券</span>
                </Button>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {storage.cachedFeed.items.map((item) => {
                  const pMeta =
                    PLATFORM_META[item.platform as DealPlatform] ?? {
                      label: item.platform,
                      shortLabel: item.platform,
                      color: 'var(--accent)',
                    };
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-2.5 rounded-[12px] border border-[var(--line)] bg-[var(--surface-raised)] p-3.5"
                    >
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-2)]">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: pMeta.color }}
                            />
                            <span>{pMeta.label}</span>
                            {item.merchant && (
                              <span className="text-[var(--ink-3)]">· {item.merchant}</span>
                            )}
                          </span>
                          <Badge tone="dawn">{item.discountBadge}</Badge>
                        </div>
                        <div className="text-[14.5px] font-semibold text-[var(--ink-1)]">
                          {item.title}
                        </div>
                        <div className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                          {item.finalPrice !== undefined && (
                            <strong className="font-mono-num text-[16px] text-[var(--growth)]">
                              ¥{item.finalPrice}
                            </strong>
                          )}
                          {item.originalPrice !== undefined && (
                            <span className="font-mono-num text-[var(--ink-3)] line-through">
                              ¥{item.originalPrice}
                            </span>
                          )}
                          {item.minSpend && (
                            <span className="text-[var(--ink-2)]">{item.minSpend}</span>
                          )}
                          {item.expiresAt && (
                            <span className="font-mono-num text-[var(--ink-3)]">
                              至 {item.expiresAt}
                            </span>
                          )}
                        </div>
                        {item.note && (
                          <p className="m-0 text-[12px] text-[var(--ink-3)]">{item.note}</p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-1.5">
                        {item.promoCode && (
                          <Button
                            size="sm"
                            variant="subtle"
                            onClick={() => handleCopyText(item.promoCode!, `${item.title} 口令`)}
                          >
                            <Copy size={12} />
                            <span>复制口令</span>
                          </Button>
                        )}
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[34px] items-center gap-1 rounded-[10px] border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 text-[12.5px] font-medium text-[var(--ink-1)] no-underline transition-colors hover:bg-[var(--accent)] hover:text-white"
                          >
                            <span>直达领券</span>
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 平台筛选条 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: '全部精选' },
                  { id: 'meituan', label: '美团外卖' },
                  { id: 'eleme', label: '饿了么/闪购' },
                  { id: 'taobao', label: '淘宝' },
                  { id: 'douyin', label: '抖音团购' },
                  { id: 'jd', label: '京东' },
                  { id: 'student', label: '学生与日常' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setPlatformFilter(f.id)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-[12.5px] transition-colors',
                    platformFilter === f.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-[var(--line)] bg-transparent text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {!hasLiveItems && (
              <span className="text-[12px] text-[var(--ink-3)]">
                内置官方直达清单开箱即用 · 点右上「配置实时券源」可接自己的联盟 Worker
              </span>
            )}
          </div>

          {/* 内置官方高频省钱卡片 */}
          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {filteredChannels.map((ch) => {
              const pMeta = PLATFORM_META[ch.platform];
              return (
                <div
                  key={ch.id}
                  className="glass-plate flex flex-col justify-between gap-3 p-4"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-2)]">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: pMeta.color }}
                        />
                        <span>{ch.platformLabel}</span>
                      </span>
                      <Badge tone="dawn">{ch.benefitBadge}</Badge>
                    </div>

                    <h3 className="m-0 text-[15.5px] font-semibold leading-[1.45] text-[var(--ink-1)]">
                      {ch.title}
                    </h3>

                    <p className="m-0 text-[13.2px] leading-[1.65] text-[var(--ink-2)]">
                      {ch.howToClaim}
                    </p>

                    <div className="rounded-[10px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-3 py-2 text-[12.2px] leading-[1.55] text-[var(--ink-1)]">
                      <span className="font-semibold text-[var(--warning)]">避坑提醒：</span>
                      {ch.pitfallTip}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-2.5">
                    {ch.searchKeyword ? (
                      <Button
                        size="sm"
                        variant="subtle"
                        onClick={() =>
                          handleCopyText(
                            ch.searchKeyword!,
                            `App 内搜词「${ch.searchKeyword}」`
                          )
                        }
                      >
                        <Copy size={12} />
                        <span>复制搜词：{ch.searchKeyword}</span>
                      </Button>
                    ) : (
                      <span />
                    )}

                    {ch.officialUrl && (
                      <a
                        href={ch.officialUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-[var(--accent)] no-underline hover:underline"
                      >
                        <span>{ch.officialLabel ?? '官方入口'}</span>
                        <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: 外卖 / 团购实付比价器 */}
      {activeTab === 'compare' && (
        <div className="space-y-4" data-testid="deals-panel-compare">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[13.5px] text-[var(--ink-2)]">
              把同家店在三个平台的原价、满减神券、配送费与打包费填进去，一眼看穿隐形附加费
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {COMPARE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setPresetId(p.id);
                    setCompareRows(p.rows.map((r) => ({ ...r })));
                  }}
                  className={cn(
                    'cursor-pointer rounded-full border px-2.5 py-1 text-[12px] transition-colors',
                    presetId === p.id
                      ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink-1)]'
                      : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                  )}
                >
                  场景：{p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-3">
            {compareAnalysis.computed.map((row) => {
              const isWinner = compareAnalysis.cheapest?.id === row.id;
              return (
                <div
                  key={row.id}
                  className={cn(
                    'glass-plate space-y-3 p-4 transition-colors',
                    isWinner && 'border-[var(--growth-border)]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--ink-1)]">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: row.color }}
                      />
                      <span>{row.label}</span>
                    </span>
                    {isWinner && <Badge tone="growth">当前最省</Badge>}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <label className="space-y-1 text-[11.5px] text-[var(--ink-3)]">
                      <span>商品标价 (¥)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        data-testid={`compare-${row.id}-subtotal`}
                        className="v3-input font-mono-num text-[13.5px]"
                        value={row.subtotal}
                        onChange={(e) => handleRowFieldChange(row.id, 'subtotal', e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-[11.5px] text-[var(--ink-3)]">
                      <span>满减+神券 (¥)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        data-testid={`compare-${row.id}-discount`}
                        className="v3-input font-mono-num text-[13.5px]"
                        value={row.discount}
                        onChange={(e) => handleRowFieldChange(row.id, 'discount', e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-[11.5px] text-[var(--ink-3)]">
                      <span>配送费 (¥)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="v3-input font-mono-num text-[13.5px]"
                        value={row.delivery}
                        onChange={(e) => handleRowFieldChange(row.id, 'delivery', e.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-[11.5px] text-[var(--ink-3)]">
                      <span>打包费 (¥)</span>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="v3-input font-mono-num text-[13.5px]"
                        value={row.packing}
                        onChange={(e) => handleRowFieldChange(row.id, 'packing', e.target.value)}
                      />
                    </label>
                  </div>

                  <div className="flex items-baseline justify-between border-t border-[var(--line)] pt-2.5">
                    <span className="text-[12.5px] text-[var(--ink-2)]">真实到手实付</span>
                    <strong
                      data-testid={`compare-${row.id}-net`}
                      className={cn(
                        'font-mono-num text-[22px] font-semibold',
                        isWinner ? 'text-[var(--growth)]' : 'text-[var(--ink-1)]'
                      )}
                    >
                      ¥{row.net.toFixed(1)}
                    </strong>
                  </div>

                  {row.highFeeTrap ? (
                    <div className="flex items-start gap-1.5 rounded-[9px] border border-[var(--warning-border)] bg-[var(--warning-soft)] px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-[var(--ink-1)]">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-[var(--warning)]" />
                      <span>
                        配送+打包共 ¥{row.hiddenFees.toFixed(1)}（占实付 {row.feeRatio}%），附加费偏高
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11.5px] text-[var(--ink-3)]">
                      附加费 ¥{row.hiddenFees.toFixed(1)}（占实付 {row.feeRatio}%）
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 最省结论条 + 一键记账 */}
          {compareAnalysis.cheapest && (
            <div
              data-testid="deals-compare-winner"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[var(--growth-border)] bg-[var(--growth-soft)] px-4 py-3"
            >
              <div className="flex items-center gap-2.5 text-[14px] text-[var(--ink-1)]">
                <CheckCircle2 size={17} className="shrink-0 text-[var(--growth)]" />
                <span>
                  本次最划算：<strong>{compareAnalysis.cheapest.label}</strong>（实付{' '}
                  <strong className="font-mono-num text-[var(--growth)]">
                    ¥{compareAnalysis.cheapest.net.toFixed(1)}
                  </strong>
                  ），比最贵渠道立省{' '}
                  <strong className="font-mono-num text-[var(--dawn)]">
                    ¥{compareAnalysis.spread.toFixed(1)}
                  </strong>
                </span>
              </div>

              <Button
                size="sm"
                variant="growth"
                data-testid="deals-log-saving-btn"
                onClick={handleLogSaving}
              >
                <Wallet size={13} />
                <span>把省下的 ¥{compareAnalysis.spread.toFixed(1)} 记进小账</span>
              </Button>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: 我的口令夹 & 每周省钱日历 */}
      {activeTab === 'pocket' && (
        <div className="space-y-4" data-testid="deals-panel-pocket">
          {/* 每周省钱日历 */}
          <div className="glass-plate space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ink-1)]">
                <CalendarDays size={14} className="text-[var(--dawn)]" />
                <span>每周省钱节奏日历</span>
              </span>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_SAVING_CALENDAR.map((d) => {
                  const isToday = d.weekday === todayWeekday;
                  const active = d.weekday === selectedWeekday;
                  return (
                    <button
                      key={d.weekday}
                      type="button"
                      onClick={() => setSelectedWeekday(d.weekday)}
                      className={cn(
                        'cursor-pointer rounded-full border px-2.5 py-0.5 text-[12px] transition-colors',
                        active
                          ? 'border-[var(--dawn-border)] bg-[var(--dawn-soft)] font-semibold text-[var(--ink-1)]'
                          : 'border-[var(--line)] text-[var(--ink-3)] hover:text-[var(--ink-1)]'
                      )}
                    >
                      {d.shortLabel}
                      {isToday ? '·今' : ''}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--line)] bg-[var(--surface-raised)] px-3.5 py-2.5">
              <div className="text-[14px] font-semibold text-[var(--ink-1)]">
                {activeDayTip.shortLabel}提醒：{activeDayTip.title}
              </div>
              <p className="mt-1 mb-0 text-[13px] leading-[1.6] text-[var(--ink-2)]">
                {activeDayTip.detail}
              </p>
            </div>
          </div>

          {/* 我的随身口令与领券夹 */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="glass-plate space-y-3 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold text-[var(--ink-1)]">
                  我的常用口令与领券夹（仅存本机）
                </span>
                <Badge tone="neutral" className="font-mono-num">
                  {storage.personalCodes.length} 条
                </Badge>
              </div>

              {storage.personalCodes.length === 0 ? (
                <div className="py-6 text-center text-[13px] text-[var(--ink-3)]">
                  还没有收藏的口令或领券链接，在右侧随时添一条
                </div>
              ) : (
                <div className="space-y-2.5">
                  {storage.personalCodes.map((item) => {
                    const pMeta = PLATFORM_META[item.platform] ?? PLATFORM_META.meituan;
                    const isUrl = isSafeHttpUrl(item.codeOrLink);
                    return (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-start justify-between gap-2.5 rounded-[11px] border border-[var(--line)] bg-[var(--surface-raised)] p-3"
                      >
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: pMeta.color }}
                            />
                            <span className="text-[var(--ink-3)]">{pMeta.shortLabel}</span>
                            <strong className="text-[13.5px] font-semibold text-[var(--ink-1)]">
                              {item.title}
                            </strong>
                          </div>
                          <div className="truncate font-mono-num text-[12.5px] text-[var(--dawn)]">
                            {item.codeOrLink}
                          </div>
                          {item.note && (
                            <div className="text-[12px] text-[var(--ink-2)]">{item.note}</div>
                          )}
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="subtle"
                            onClick={() => handleCopyText(item.codeOrLink, item.title)}
                          >
                            <Copy size={12} />
                            <span>复制</span>
                          </Button>
                          {isUrl && (
                            <a
                              href={item.codeOrLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-[var(--line)] text-[var(--ink-2)] hover:text-[var(--ink-1)]"
                              aria-label={`打开 ${item.title}`}
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                          <Popconfirm
                            title={`删除「${item.title}」？`}
                            confirmLabel="删除"
                            tone="danger"
                            onConfirm={() => handleDeletePersonalCode(item.id)}
                          >
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label={`删除 ${item.title}`}
                            >
                              <Trash2 size={13} />
                            </Button>
                          </Popconfirm>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 新增口令表单 + 省钱账本 */}
            <div className="space-y-4">
              <div className="glass-plate space-y-2.5 p-4">
                <div className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--ink-1)]">
                  <BookmarkPlus size={14} className="text-[var(--accent)]" />
                  <span>存一条常用口令 / 领券链接</span>
                </div>

                <select
                  className="v3-select text-[13px]"
                  value={newCodePlatform}
                  onChange={(e) => setNewCodePlatform(e.target.value as DealPlatform)}
                >
                  {(Object.keys(PLATFORM_META) as DealPlatform[]).map((k) => (
                    <option key={k} value={k}>
                      {PLATFORM_META[k].label}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  className="v3-input text-[13px]"
                  placeholder="标题，如：公司楼下瑞幸 9.9 券"
                  value={newCodeTitle}
                  onChange={(e) => setNewCodeTitle(e.target.value)}
                />

                <input
                  type="text"
                  className="v3-input text-[13px]"
                  placeholder="淘口令 / App 搜词 / 领券链接"
                  value={newCodeValue}
                  onChange={(e) => setNewCodeValue(e.target.value)}
                />

                <input
                  type="text"
                  className="v3-input text-[13px]"
                  placeholder="备注（可选，如：限工作日上午用）"
                  value={newCodeNote}
                  onChange={(e) => setNewCodeNote(e.target.value)}
                />

                <Button
                  size="sm"
                  variant="primary"
                  className="w-full"
                  onClick={handleAddPersonalCode}
                >
                  存进口令夹
                </Button>
              </div>

              {/* 本月省钱小账 */}
              <div className="glass-plate space-y-2.5 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-[var(--ink-1)]">
                    本月比价省钱小账
                  </span>
                  <strong className="font-mono-num text-[15px] text-[var(--growth)]">
                    ¥{monthlySavedTotal}
                  </strong>
                </div>

                {storage.ledger.length === 0 ? (
                  <p className="m-0 text-[12px] text-[var(--ink-3)]">
                    在「外卖/团购实付比价」算出差价后可一键记一笔，慢慢看着自己省出几顿大餐。
                  </p>
                ) : (
                  <>
                    <div className="max-h-[120px] space-y-1.5 overflow-y-auto text-[12px]">
                      {storage.ledger.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center justify-between gap-2 text-[var(--ink-2)]"
                        >
                          <span className="truncate">
                            {item.dateKey.slice(5)} · {item.label}
                          </span>
                          <strong className="font-mono-num shrink-0 text-[var(--growth)]">
                            +¥{item.savedYuan}
                          </strong>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-end">
                      <Popconfirm
                        title="清空全部省钱小账？"
                        confirmLabel="清空"
                        tone="warning"
                        onConfirm={handleClearLedger}
                      >
                        <Button size="sm" variant="ghost">
                          清空记录
                        </Button>
                      </Popconfirm>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
