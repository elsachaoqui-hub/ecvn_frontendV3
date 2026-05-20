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

export const UI_FONT_DEFAULTS: UiFontScale = {
  '10': 10,
  '11': 11,
  '12': 12,
  '13': 13,
  '14': 14,
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
  '10': { label: '極小字 10px', usage: '圖表座標軸、桑基圖小標、密集輔助說明', tailwind: 'text-ui-10' },
  '11': { label: '輔助字 11px', usage: '圖表圖例、表單小標（部分頁面）', tailwind: 'text-ui-11' },
  '12': { label: '次要字 12px', usage: '標籤、表格註解、側欄提示', tailwind: 'text-xs' },
  '13': { label: '地圖標題 13px', usage: '地圖資源點 tooltip 標題', tailwind: '（index.css）' },
  '14': { label: '內文小 14px', usage: '正文、按鈕、表格、子選單（最常用）', tailwind: 'text-sm' },
  '16': { label: '內文 16px', usage: '表單輸入、預設內文', tailwind: 'text-base' },
  '18': { label: '小標題 18px', usage: '區塊標題、卡片標題', tailwind: 'text-lg' },
  '20': { label: '標題 20px', usage: '對話框標題、Header 大字', tailwind: 'text-xl' },
  '24': { label: '頁面標題 24px', usage: '各作業頁 H2 主標', tailwind: 'text-2xl' },
  '30': { label: '強調數字 30px', usage: 'KPI、大數字展示', tailwind: 'text-3xl' },
  '36': { label: '特大數字 36px', usage: '儀表板特大指標', tailwind: 'text-4xl' },
};

const STORAGE_KEY = 'ecvn-ui-font-scale-v1';

export function loadUiFontScale(): UiFontScale {
  if (typeof window === 'undefined') return { ...UI_FONT_DEFAULTS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...UI_FONT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<UiFontScale>;
    const out = { ...UI_FONT_DEFAULTS };
    for (const key of UI_FONT_KEYS) {
      const v = parsed[key];
      if (typeof v === 'number' && Number.isFinite(v) && v >= 8 && v <= 48) {
        out[key] = Math.round(v * 10) / 10;
      }
    }
    return out;
  } catch {
    return { ...UI_FONT_DEFAULTS };
  }
}

export function saveUiFontScale(scale: UiFontScale): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(scale));
}

export function applyUiFontScaleToDocument(scale: UiFontScale): void {
  const root = document.documentElement;
  for (const key of UI_FONT_KEYS) {
    root.style.setProperty(`--ui-font-${key}`, `${scale[key]}px`);
  }
}

export function getChartFontSizes(scale: UiFontScale) {
  return {
    axis: scale['10'],
    legend: scale['11'],
    label: scale['12'],
    sankeyNode: scale['11'],
    sankeyNodeEnlarge: scale['12'],
  };
}
