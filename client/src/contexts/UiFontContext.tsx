import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  applyUiFontScaleToDocument,
  getChartFontSizes,
  clampUiFontPx,
  loadUiFontScale,
  normalizeUiFontScale,
  saveUiFontScale,
  UI_FONT_DEFAULTS,
  type UiFontKey,
  type UiFontScale,
} from '@/lib/uiFontScale';

type UiFontContextValue = {
  scale: UiFontScale;
  chartFonts: ReturnType<typeof getChartFontSizes>;
  setFontSize: (key: UiFontKey, px: number) => void;
  resetAll: () => void;
};

const UiFontContext = createContext<UiFontContextValue | null>(null);

export function UiFontProvider({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState<UiFontScale>(() => loadUiFontScale());

  useEffect(() => {
    applyUiFontScaleToDocument(scale);
    saveUiFontScale(scale);
  }, [scale]);

  const setFontSize = useCallback((key: UiFontKey, px: number) => {
    setScale((prev) => ({ ...prev, [key]: clampUiFontPx(px) }));
  }, []);

  const resetAll = useCallback(() => {
    setScale(normalizeUiFontScale(UI_FONT_DEFAULTS));
  }, []);

  const chartFonts = useMemo(() => getChartFontSizes(scale), [scale]);

  const value = useMemo(
    () => ({ scale, chartFonts, setFontSize, resetAll }),
    [scale, chartFonts, setFontSize, resetAll]
  );

  return <UiFontContext.Provider value={value}>{children}</UiFontContext.Provider>;
}

export function useUiFont() {
  const ctx = useContext(UiFontContext);
  if (!ctx) throw new Error('useUiFont must be used within UiFontProvider');
  return ctx;
}
