export type DealPlatform = 'meituan' | 'eleme' | 'taobao' | 'douyin' | 'jd' | 'student';

export interface CuratedSavingChannel {
  id: string;
  platform: DealPlatform;
  platformLabel: string;
  title: string;
  benefitBadge: string;
  howToClaim: string;
  pitfallTip: string;
  searchKeyword?: string;
  officialUrl?: string;
  officialLabel?: string;
}

export interface WeekdaySavingTip {
  weekday: number; // 0 = 周日 ... 6 = 周六
  shortLabel: string;
  title: string;
  detail: string;
}

export interface LiveDealItem {
  id: string;
  platform: DealPlatform | string;
  title: string;
  merchant?: string;
  discountBadge: string;
  finalPrice?: number;
  originalPrice?: number;
  minSpend?: string;
  promoCode?: string;
  url?: string;
  expiresAt?: string;
  note?: string;
}

export interface LiveDealsFeedPayload {
  updatedAt: string;
  sourceName: string;
  items: LiveDealItem[];
}

export interface PersonalCouponCode {
  id: string;
  platform: DealPlatform;
  title: string;
  codeOrLink: string;
  note?: string;
  createdAt: string;
}

export interface SavedDealLedgerEntry {
  id: string;
  dateKey: string;
  label: string;
  savedYuan: number;
}

export interface DealsHubStorage {
  feedUrl: string;
  cachedFeed?: LiveDealsFeedPayload;
  personalCodes: PersonalCouponCode[];
  ledger: SavedDealLedgerEntry[];
}

export const PLATFORM_META: Record<
  DealPlatform,
  { label: string; color: string; shortLabel: string }
> = {
  meituan: { label: '美团外卖', shortLabel: '美团', color: '#f5b841' },
  eleme: { label: '饿了么 / 闪购', shortLabel: '饿了么', color: '#38bdf8' },
  taobao: { label: '淘宝 / 天猫', shortLabel: '淘宝', color: '#fb923c' },
  douyin: { label: '抖音团购', shortLabel: '抖音', color: '#f472b6' },
  jd: { label: '京东自营', shortLabel: '京东', color: '#ef4444' },
  student: { label: '学生与日常权益', shortLabel: '学生权益', color: '#34d399' },
};

export const CURATED_SAVING_CHANNELS: CuratedSavingChannel[] = [
  {
    id: 'ch-mt-shenquan',
    platform: 'meituan',
    platformLabel: '美团外卖',
    title: '天天神券膨胀 + 拼好饭同店比价',
    benefitBadge: '外卖高频省 4–12 元',
    howToClaim:
      '打开美团 App 搜索「天天神券」领取并膨胀后再选店；同一家店如果只点单人工作餐，顺手搜店名看「拼好饭」入口，往往直接免配送费和打包费。',
    pitfallTip:
      '部分标榜大额满减的店铺会把菜品原价调高或收 4–6 元高额打包费，下单前可用右侧「实付比价器」核对真实到手价。',
    searchKeyword: '天天神券',
    officialUrl: 'https://www.meituan.com/',
    officialLabel: '美团官网',
  },
  {
    id: 'ch-mt-member',
    platform: 'meituan',
    platformLabel: '美团外卖',
    title: '神会员月卡理性开卡与自动续费检查',
    benefitBadge: '月点 4 单以上更划算',
    howToClaim:
      '美团内搜「神会员」看首月或续费活动价，确认自己本月至少点 4 单外卖或团购再开通；开完立刻去支付软件关闭连续包月，用完再按需续。',
    pitfallTip:
      '神会员券多为 5 元无门槛或膨胀券，注意能否与店铺满减同享，切勿为了用券凑单买不需要的小食。',
    searchKeyword: '神会员',
  },
  {
    id: 'ch-tb-subsidy',
    platform: 'taobao',
    platformLabel: '淘宝 / 天猫',
    title: '淘宝百亿补贴 + 淘金币足迹抵扣',
    benefitBadge: '日用数码直降 + 额外抵 2%–5%',
    howToClaim:
      '买日用消耗品、粮油零食和数码配件时，优先搜「百亿补贴」核对官方补贴价；普通商品加购后先退回首页点进「淘金币」从足迹下单，常多省几元。',
    pitfallTip:
      '大促前先看商品近 30 天价格趋势，警惕「先涨价再发券」；生鲜与低价配件优先选带「运费险」或官方自营渠道。',
    searchKeyword: '百亿补贴',
    officialUrl: 'https://www.taobao.com/',
    officialLabel: '淘宝官网',
  },
  {
    id: 'ch-eleme-flash',
    platform: 'eleme',
    platformLabel: '饿了么 / 闪购',
    title: '淘宝闪购 / 饿了么每日大额餐补与超市券',
    benefitBadge: '与美团交叉比价立省',
    howToClaim:
      '点外卖或买急用日用品前，在饿了么或淘宝「闪购/小时达」搜「天天领红包」或同店名称，同一连锁品牌（咖啡、快餐、药店）两家实付差价常达 5–10 元。',
    pitfallTip:
      '注意起送价门槛与夜间加收配送费时段（常见 21:00 后上涨），超市急买先看满 29/39 免运费档位。',
    searchKeyword: '天天领红包',
    officialUrl: 'https://www.ele.me/',
    officialLabel: '饿了么官网',
  },
  {
    id: 'ch-dy-groupbuy',
    platform: 'douyin',
    platformLabel: '抖音团购',
    title: '到店堂食与茶饮连锁次卡团购（随时退）',
    benefitBadge: '堂食常享 6–8 折',
    howToClaim:
      '去餐厅堂食、喝连锁咖啡奶茶、看电影或剪发前，直接在抖音搜「店名 + 团购」查看官方团购券；多数支持「随时退、过期自动退」，点单前核销即可。',
    pitfallTip:
      '下单前一定点开「使用规则」看三件事：周末节假日是否可用、是否需提前预约、每人每桌限用几张。',
    searchKeyword: '团购优惠',
    officialUrl: 'https://www.douyin.com/',
    officialLabel: '抖音官网',
  },
  {
    id: 'ch-jd-priceguard',
    platform: 'jd',
    platformLabel: '京东自营',
    title: '京东百亿补贴 + 买后一键价保退差价',
    benefitBadge: '7–30 天买贵退差',
    howToClaim:
      '购买家电、数码、猫粮纸品等自营标品，先看「百亿补贴」与自营价；下单后在「我的 → 客户服务 → 价格保护」每周顺手点一次「一键价保」，降价自动退差。',
    pitfallTip:
      '凑单满减退部分商品可能触发优惠失效或运费扣除，退货前先确认剩余商品的实付变化。',
    searchKeyword: '价格保护',
    officialUrl: 'https://www.jd.com/',
    officialLabel: '京东官网',
  },
  {
    id: 'ch-stu-campus',
    platform: 'student',
    platformLabel: '学生与日常权益',
    title: '高校学生认证隐藏省钱清单（出行 / 餐饮 / 外卖）',
    benefitBadge: '在校生全年可省千元',
    howToClaim:
      '完成支付宝 / 美团「高校学生认证」可解锁低价校园月卡与专属外卖券；12306 每学年可享 4 次单程学生优惠票；海底捞等品牌在指定时段提供学生专属折扣。',
    pitfallTip:
      '所有校园优惠均走官方 App 内置学信网/高校认证通道，切勿向陌生代认证或第三方表单提供身份证与学信网密码。',
    searchKeyword: '高校学生认证',
    officialUrl: 'https://www.12306.cn/',
    officialLabel: '12306 官网',
  },
  {
    id: 'ch-stu-edu-software',
    platform: 'student',
    platformLabel: '学生与日常权益',
    title: '数码教育优惠与正版软件免费授权',
    benefitBadge: '硬件直降 + 工具免费',
    howToClaim:
      '高校在校生与教职工可凭正规学籍验证，申请 Apple 教育优惠（暑期返校季常赠配件）、JetBrains 全家桶正版免费、GitHub Student Pack 与 Notion 教育版。',
    pitfallTip:
      '硬件教育优惠务必比对官方教育价与电商百亿补贴价（有时百亿补贴叠加赠品折算后更低）。',
    searchKeyword: '教育优惠',
    officialUrl: 'https://www.apple.com.cn/cn-edu/store',
    officialLabel: 'Apple 教育商店',
  },
];

export const WEEKDAY_SAVING_CALENDAR: WeekdaySavingTip[] = [
  {
    weekday: 0,
    shortLabel: '周日',
    title: '自动续费清查与下周菜篮子日',
    detail:
      '花 2 分钟打开微信支付设置与支付宝免密扣款，关掉不再用的会员自动续费；顺手盘点下周刚需日用品，避免临时高价闪购。',
  },
  {
    weekday: 1,
    shortLabel: '周一',
    title: '通勤咖啡与工作餐周卡日',
    detail:
      '本周高频喝咖啡或吃连锁快餐时，周一先在品牌官方小程序或抖音团购看「多杯次卡 / 5 天工作餐券」，比每天单买常省 25% 以上。',
  },
  {
    weekday: 2,
    shortLabel: '周二',
    title: '外卖拼好饭与同店双平台比价日',
    detail:
      '周中外卖红包竞争最激烈，同一家常吃店铺同时看美团与饿了么实付价，并留意「拼好饭」免打包配送专场。',
  },
  {
    weekday: 3,
    shortLabel: '周三',
    title: '银行信用卡美食日 & 平台神券日',
    detail:
      '多家银行 App、云闪付及外卖平台把大额立减/半价代金券放在周三上午发放，出门吃顿好的前先看一眼常持银行卡活动。',
  },
  {
    weekday: 4,
    shortLabel: '周四',
    title: '快餐会员日 & 网购一键价保日',
    detail:
      '快餐品牌周四常有经典会员特惠；顺手点开京东/淘宝近期订单查一下「价保」，经常能退回几元到几十元差价。',
  },
  {
    weekday: 5,
    shortLabel: '周五',
    title: '周末聚餐团购提前囤券日',
    detail:
      '周末打算外出聚餐、看电影或短途玩乐，周五晚上先在抖音/美团搜「店名团购」囤好支持随时退的套餐，避开现场原价。',
  },
  {
    weekday: 6,
    shortLabel: '周六',
    title: '商超晚间生鲜折价窗口（19:30–20:30）',
    detail:
      '大型连锁商超的烘焙、熟食与叶菜通常在晚间 19:30 后陆续开启 5–7 折日清，适合周末散步顺手补货。',
  },
];

export const DEFAULT_PERSONAL_CODES: PersonalCouponCode[] = [
  {
    id: 'preset-mt-search',
    platform: 'meituan',
    title: '美团外卖神券直达搜词',
    codeOrLink: '天天神券',
    note: '复制后打开美团 App 顶栏粘贴搜索，每天先膨胀再点单',
    createdAt: '2026-01-01',
  },
  {
    id: 'preset-tb-subsidy',
    platform: 'taobao',
    title: '淘宝百亿补贴比价搜词',
    codeOrLink: '百亿补贴',
    note: '买日用大件前先核对补贴价，再决定是否加购',
    createdAt: '2026-01-01',
  },
  {
    id: 'preset-autopay-check',
    platform: 'student',
    title: '月度防反薅：关闭自动续费路径',
    codeOrLink: '微信：我 → 服务 → 钱包 → 支付设置 → 自动续费',
    note: '开通任何首月特惠外卖/视频会员后，立刻顺手关掉连续扣款',
    createdAt: '2026-01-01',
  },
];

export const WORKER_JSON_EXAMPLE = `{
  "updatedAt": "2026-11-27T12:00:00Z",
  "sourceName": "我的个人联盟券源",
  "items": [
    {
      "id": "mt-001",
      "platform": "meituan",
      "title": "美团外卖大额满减神券包",
      "merchant": "官方活动页",
      "discountBadge": "满 25 减 10",
      "finalPrice": 15,
      "originalPrice": 25,
      "minSpend": "满 25 元可用",
      "promoCode": "复制口令或点击直达链接",
      "url": "https://你的官方联盟推广链接",
      "expiresAt": "2026-12-31",
      "note": "由个人 Cloudflare Worker 经官方联盟 API 实时拉取"
    }
  ]
}`;

export const DEALS_HUB_STORAGE_KEY = 'msg-deals-hub-v1';

export function loadDealsHubStorage(): DealsHubStorage {
  if (typeof window === 'undefined') {
    return { feedUrl: '', personalCodes: DEFAULT_PERSONAL_CODES, ledger: [] };
  }
  try {
    const raw = window.localStorage.getItem(DEALS_HUB_STORAGE_KEY);
    if (!raw) {
      return { feedUrl: '', personalCodes: DEFAULT_PERSONAL_CODES, ledger: [] };
    }
    const parsed = JSON.parse(raw) as Partial<DealsHubStorage>;
    return {
      feedUrl: typeof parsed.feedUrl === 'string' ? parsed.feedUrl : '',
      cachedFeed:
        parsed.cachedFeed &&
        typeof parsed.cachedFeed.sourceName === 'string' &&
        Array.isArray(parsed.cachedFeed.items)
          ? parsed.cachedFeed
          : undefined,
      personalCodes: Array.isArray(parsed.personalCodes)
        ? parsed.personalCodes
        : DEFAULT_PERSONAL_CODES,
      ledger: Array.isArray(parsed.ledger) ? parsed.ledger : [],
    };
  } catch {
    return { feedUrl: '', personalCodes: DEFAULT_PERSONAL_CODES, ledger: [] };
  }
}

export function saveDealsHubStorage(next: DealsHubStorage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DEALS_HUB_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore quota errors
  }
}
