/** 全站字級（px）。對應 Tailwind text-* 與圖表 fontSize。 */
export const UI_FONT_KEYS = [
  '10',
  '11',
  '12',
  '13',
  '14',
  '16',
  '18',
  '20',
  '24',
  '30',
  '36',
] as const;

export type UiFontKey = (typeof UI_FONT_KEYS)[number];

export type UiFontScale = Record<UiFontKey, number>;

/** 全站字級下限：小於此值的設定會自動提升至此 */
export const UI_FONT_MIN_PX = 15;

export const UI_FONT_DEFAULTS: UiFontScale = {
  '10': 15,
  '11': 15,
  '12': 15,
  '13': 15,
  '14': 15,
  '16': 16,
  '18': 18,
  '20': 20,
  '24': 24,
  '30': 30,
  '36': 36,
};

/** 設定頁顯示用：分類與對應的 Tailwind / 用途說明 */
export const UI_FONT_META: Record<
  UiFontKey,
  { label: string; usage: string; tailwind?: string }
> = {
  '10': { label: '極小字（預設 15px）', usage: '圖表座標軸、桑基圖小標、密集輔助說明', tailwind: 'text-ui-10' },
  '11': { label: '輔助字（預設 15px）', usage: '圖表圖例、表單小標（部分頁面）', tailwind: 'text-ui-11' },
  '12': { label: '次要字（預設 15px）', usage: '標籤、表格註解、側欄提示', tailwind: 'text-xs' },
  '13': { label: '地圖標題（預設 15px）', usage: '地圖資源點 tooltip 標題', tailwind: '（index.css）' },
  '14': { label: '內文小（預設 15px）', usage: '正文、按鈕、表格、子選單（最常用）', tailwind: 'text-sm' },
  '16': { label: '內文 16px', usage: '表單輸入、預設內文', tailwind: 'text-base' },
  '18': { label: '小標題 18px', usage: '區塊標題、卡片標題', tailwind: 'text-lg' },
  '20': { label: '標題 20px', usage: '對話框標題、Header 大字', tailwind: 'text-xl' },
  '24': { label: '頁面標題 24px', usage: '各作業頁 H2 主標', tailwind: 'text-2xl' },
  '30': { label: '強調數字 30px', usage: 'KPI、大數字展示', tailwind: 'text-3xl' },
  '36': { label: '特大數字 36px', usage: '儀表板特大指標', tailwind: 'text-4xl' },
};

const STORAGE_KEY = 'ecvn-ui-font-scale-v2';

export function clampUiFontPx(px: number): number {
  const rounded = Math.round(px * 10) / 10;
  return Math.min(48, Math.max(UI_FONT_MIN_PX, rounded));
}

/** 套用下限並與預設值合併 */
export function normalizeUiFontScale(partial?: Partial<UiFontScale>): UiFontScale {
  const out = { ...UI_FONT_DEFAULTS };
  if (!partial) return out;
  for (const key of UI_FONT_KEYS) {
    const v = partial[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = clampUiFontPx(v);
    }
  }
  return out;
}

export function loadUiFontScale(): UiFontScale {
  if (typeof window === 'undefined') return { ...UI_FONT_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...UI_FONT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<UiFontScale>;
    return normalizeUiFontScale(parsed);
  } catch {
    return { ...UI_FONT_DEFAULTS };
  }
}

export function saveUiFontScale(scale: UiFontScale): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizeUiFontScale(scale)));
}

export function applyUiFontScaleToDocument(scale: UiFontScale): void {
  const normalized = normalizeUiFontScale(scale);
  const root = document.documentElement;
  for (const key of UI_FONT_KEYS) {
    root.style.setProperty(`--ui-font-${key}`, `${normalized[key]}px`);
  }
}

export function getChartFontSizes(scale: UiFontScale) {
  const s = normalizeUiFontScale(scale);
  return {
    axis: s['10'],
    legend: s['11'],
    label: s['12'],
    sankeyNode: s['11'],
    sankeyNodeEnlarge: s['12'],
  };
}
