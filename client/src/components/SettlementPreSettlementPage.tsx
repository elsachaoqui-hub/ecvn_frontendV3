import type { EChartsOption } from 'echarts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import SettlementEnergyFlowSankey, {
  type EnergyFlowAggregate,
  type EnergyFlowDrill,
  type SankeyClickPayload,
} from '@/components/SettlementEnergyFlowSankey';
import SankeyDetailDialog, {
  type SankeyDetailFocus,
  type SankeyMetricFocus,
} from '@/components/SankeyDetailDialog';
import { useUiFont } from '@/contexts/UiFontContext';
import { buildSankeyChartFromDates, loadSankeyExplorerDataset } from '@/lib/sankeyExplorerCsv';

type HourRow = {
  hour: number;
  generationPlan: number;
  generationActual: number;
  loadPlan: number;
  loadActual: number;
  storagePlan: number;
  storageActual: number;
};

function buildHourlyRowsByDate(dateLabel: string): HourRow[] {
  const seed = dateLabel.split('-').reduce((acc, part) => acc + Number(part || 0), 0);
  return Array.from({ length: 24 }, (_, hour) => {
    const dayOffset = ((seed + hour * 13) % 11) - 5;
    const baseGen = hour >= 6 && hour <= 17 ? 55 + Math.sin((hour - 6) / 11 * Math.PI) * 95 : 18;
    const generationPlan = Number(baseGen.toFixed(1));
    const generationActual = Number((generationPlan * (0.93 + ((hour % 5) - 2) * 0.018 + dayOffset * 0.003)).toFixed(1));

    const baseLoad = 72 + Math.cos((hour - 13) / 11 * Math.PI) * 26 + (hour >= 18 && hour <= 22 ? 24 : 0);
    const loadPlan = Number(baseLoad.toFixed(1));
    const loadActual = Number((loadPlan * (0.95 + ((hour % 4) - 1) * 0.02 - dayOffset * 0.0025)).toFixed(1));

    const storagePlan = Number((hour >= 11 && hour <= 14 ? 20 + (hour - 11) * 4 : hour >= 18 && hour <= 20 ? -28 + (hour - 18) * 2 : 0).toFixed(1));
    const storageActual = Number((storagePlan * (0.88 + ((hour % 3) - 1) * 0.06 + dayOffset * 0.002)).toFixed(1));

    return {
      hour,
      generationPlan,
      generationActual,
      loadPlan,
      loadActual,
      storagePlan,
      storageActual,
    };
  });
}

type QuarterRow = {
  slotIndex: number;
  timeLabel: string;
  generationPlan: number;
  generationActual: number;
  loadPlan: number;
  loadActual: number;
  storagePlan: number;
  storageActual: number;
};

/** 將單日小時列展開為 96 筆 15 分鐘列（每小時四等分加權，加總與小時值一致） */
function expandHourlyToQuarterRows(rows: HourRow[], dateLabel: string): QuarterRow[] {
  const dateSeed = dateLabel.split('-').reduce((acc, part) => acc + Number(part || 0), 0);
  const out: QuarterRow[] = [];

  for (const row of rows) {
    const h = row.hour;
    const w0 = 0.23 + ((dateSeed + h * 7) % 8) * 0.01;
    const w1 = 0.27 - ((dateSeed + h * 3) % 5) * 0.008;
    const w2 = 0.26 + ((dateSeed + h) % 4) * 0.01;
    const w3 = Math.max(0.05, 1 - w0 - w1 - w2);
    const sumW = w0 + w1 + w2 + w3;
    const weights = [w0 / sumW, w1 / sumW, w2 / sumW, w3 / sumW];

    const splitHourTotal = (total: number): number[] => {
      const raw = weights.map((w) => Number((total * w).toFixed(3)));
      const drift = Number((total - raw.reduce((a, b) => a + b, 0)).toFixed(3));
      raw[3] = Number((raw[3] + drift).toFixed(3));
      return raw;
    };

    const genP = splitHourTotal(row.generationPlan);
    const genA = splitHourTotal(row.generationActual);
    const loadP = splitHourTotal(row.loadPlan);
    const loadA = splitHourTotal(row.loadActual);
    const stoP = splitHourTotal(row.storagePlan);
    const stoA = splitHourTotal(row.storageActual);

    for (let q = 0; q < 4; q++) {
      const mins = q * 15;
      out.push({
        slotIndex: h * 4 + q,
        timeLabel: `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
        generationPlan: genP[q],
        generationActual: genA[q],
        loadPlan: loadP[q],
        loadActual: loadA[q],
        storagePlan: stoP[q],
        storageActual: stoA[q],
      });
    }
  }
  return out;
}

type SankeyStyleMode = 'ab' | 'c';
type SankeyGranularity = 'summary4h' | 'detail24h';
type SankeyFlowView = 'main' | 'charge' | 'discharge';

interface SettlementPreSettlementPageProps {
  pageHeading?: string;
  defaultStyleMode?: SankeyStyleMode;
}

function pickRowsByGranularity(rows: HourRow[], granularity: SankeyGranularity): HourRow[] {
  if (granularity === 'detail24h') return rows;
  return rows.filter((r) => r.hour % 4 === 0);
}

const MONTH_NAMES_TW = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
] as const;

type SankeyExplorerSort = 'desc' | 'asc';

const SANKEY_BACK_BTN =
  'rounded-md border border-indigo-600 bg-indigo-600 px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-indigo-700';

const SANKEY_NAV_BTN =
  'rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-800 shadow-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40';

const SANKEY_DETAIL_BTN =
  'rounded-md border border-blue-600 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800 shadow-sm hover:bg-blue-100';

const SANKEY_VENDOR_BTN =
  'rounded-md border border-emerald-600 bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800 shadow-sm hover:bg-emerald-100';

const SANKEY_VENDOR_CONFIRMED_BTN =
  'rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-200';

const SANKEY_METRIC_CELL_BTN =
  'cursor-pointer tabular-nums underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

function SankeyMetricButton({
  value,
  decimals = 3,
  className = '',
  onClick,
}: {
  value: number;
  decimals?: number;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={`${SANKEY_METRIC_CELL_BTN} ${className}`} onClick={onClick}>
      {value.toFixed(decimals)}
    </button>
  );
}

function sortSankeyExplorerMonths<T extends { month: number }>(rows: T[], order: SankeyExplorerSort): T[] {
  return [...rows].sort((a, b) => (order === 'desc' ? b.month - a.month : a.month - b.month));
}

function sortSankeyExplorerDates<T extends { dateLabel: string }>(rows: T[], order: SankeyExplorerSort): T[] {
  return [...rows].sort((a, b) =>
    order === 'desc' ? b.dateLabel.localeCompare(a.dateLabel) : a.dateLabel.localeCompare(b.dateLabel)
  );
}

function filterSankeyDaysChronological(
  rows: SankeyDetailDayRow[],
  year: number,
  month1to12: number
): SankeyDetailDayRow[] {
  return rows
    .filter((r) => {
      const [y, mm] = r.dateLabel.slice(0, 10).split('-').map(Number);
      return y === year && mm === month1to12;
    })
    .sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
}

type SankeyDetailDayRow = {
  dateLabel: string;
  generation: number;
  load: number;
  storageIn: number;
  storageBalance: number;
  storageOut: number;
  contractMatched: number;
  totalMatched: number;
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function ymd(year: number, month1to12: number, day: number) {
  return `${year}-${pad2(month1to12)}-${pad2(day)}`;
}

/** 示範規則：未來曆月不可點；其餘視為已結算可下鑽 */
function isSankeyMonthSelectable(year: number, month1to12: number) {
  const t = new Date();
  const y = t.getFullYear();
  const m = t.getMonth() + 1;
  if (year > y) return false;
  if (year < y) return true;
  return month1to12 <= m;
}

function aggregateSankeyMonth(
  rows: SankeyDetailDayRow[],
  year: number,
  month1to12: number
): SankeyDetailDayRow | null {
  const inMonth = rows.filter((r) => {
    const [ry, rm] = r.dateLabel.slice(0, 10).split('-').map(Number);
    return ry === year && rm === month1to12;
  });
  if (inMonth.length === 0) return null;
  const sorted = [...inMonth].sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
  const sums = sorted.reduce(
    (acc, r) => ({
      generation: acc.generation + r.generation,
      load: acc.load + r.load,
      storageIn: acc.storageIn + r.storageIn,
      storageOut: acc.storageOut + r.storageOut,
      contractMatched: acc.contractMatched + r.contractMatched,
      totalMatched: acc.totalMatched + r.totalMatched,
    }),
    { generation: 0, load: 0, storageIn: 0, storageOut: 0, contractMatched: 0, totalMatched: 0 }
  );
  const last = sorted[sorted.length - 1];
  return {
    dateLabel: `${year}-${pad2(month1to12)}`,
    generation: Number(sums.generation.toFixed(1)),
    load: Number(sums.load.toFixed(1)),
    storageIn: Number(sums.storageIn.toFixed(1)),
    storageOut: Number(sums.storageOut.toFixed(1)),
    storageBalance: last.storageBalance,
    contractMatched: Number(sums.contractMatched.toFixed(1)),
    totalMatched: Number(sums.totalMatched.toFixed(1)),
  };
}

function sumSankeyDetailRows(rows: SankeyDetailDayRow[]): Omit<EnergyFlowAggregate, 'periodLabel' | 'dayCount'> {
  const sums = rows.reduce(
    (acc, r) => ({
      generation: acc.generation + r.generation,
      load: acc.load + r.load,
      storageIn: acc.storageIn + r.storageIn,
      storageOut: acc.storageOut + r.storageOut,
      contractMatched: acc.contractMatched + r.contractMatched,
      totalMatched: acc.totalMatched + r.totalMatched,
    }),
    { generation: 0, load: 0, storageIn: 0, storageOut: 0, contractMatched: 0, totalMatched: 0 }
  );
  return {
    generation: Number(sums.generation.toFixed(1)),
    load: Number(sums.load.toFixed(1)),
    storageIn: Number(sums.storageIn.toFixed(1)),
    storageOut: Number(sums.storageOut.toFixed(1)),
    contractMatched: Number(sums.contractMatched.toFixed(1)),
    totalMatched: Number(sums.totalMatched.toFixed(1)),
  };
}

export default function SettlementPreSettlementPage({
  pageHeading = '4.1 預結算 - 桑基匹配圖',
  defaultStyleMode = 'ab',
}: SettlementPreSettlementPageProps) {
  const { chartFonts } = useUiFont();
  const chartDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const hourlyRows = useMemo(() => buildHourlyRowsByDate(chartDateLabel), [chartDateLabel]);
  const now = useMemo(() => new Date(), []);
  const [sankeyExplorerYear, setSankeyExplorerYear] = useState(() => new Date().getFullYear());
  const [sankeyExplorerView, setSankeyExplorerView] = useState<'year' | 'daily' | 'quarter'>('year');
  const [sankeyExplorerMonth, setSankeyExplorerMonth] = useState<number | null>(null);
  const [sankeyExplorerDay, setSankeyExplorerDay] = useState<string | null>(null);
  const [sankeyExplorerSort, setSankeyExplorerSort] = useState<SankeyExplorerSort>('desc');
  const sankeyExplorerScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sankeyExplorerScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
  }, [sankeyExplorerView, sankeyExplorerDay, sankeyExplorerMonth, sankeyExplorerYear]);
  const [selectedSankeyDate, setSelectedSankeyDate] = useState(() => new Date().toISOString().slice(0, 10));

  const quarterRows = useMemo(() => expandHourlyToQuarterRows(hourlyRows, chartDateLabel), [hourlyRows, chartDateLabel]);


  const preSettlementReMetrics = useMemo(() => {
    let totalLoadPlan = 0;
    let totalLoadActual = 0;
    let sumTransferredPlan = 0;
    let sumTransferredActual = 0;
    let surplusGenVsLoad = 0;
    let shortfallGenVsLoad = 0;

    for (const row of quarterRows) {
      totalLoadPlan += row.loadPlan;
      totalLoadActual += row.loadActual;
      const allocatedPlan = Math.min(row.generationPlan + Math.max(row.storagePlan, 0), row.loadPlan);
      const transferredPlan = Math.max(0, Math.min(allocatedPlan, row.loadPlan));
      const allocated = Math.min(row.generationActual + Math.max(row.storageActual, 0), row.loadPlan);
      const transferred = Math.max(0, Math.min(allocated, row.loadActual));
      sumTransferredPlan += transferredPlan;
      sumTransferredActual += transferred;
      const bal = row.generationActual - row.loadActual;
      if (bal > 0) surplusGenVsLoad += bal;
      else shortfallGenVsLoad += -bal;
    }

    const rePlanPct = totalLoadPlan > 0 ? (sumTransferredPlan / totalLoadPlan) * 100 : 0;
    const reActualPct = totalLoadActual > 0 ? (sumTransferredActual / totalLoadActual) * 100 : 0;

    return {
      rePlanPct: Number(rePlanPct.toFixed(2)),
      reActualPct: Number(reActualPct.toFixed(2)),
      surplusGenVsLoad: Number(surplusGenVsLoad.toFixed(1)),
      shortfallGenVsLoad: Number(shortfallGenVsLoad.toFixed(1)),
      totalLoadPlan: Number(totalLoadPlan.toFixed(1)),
      totalLoadActual: Number(totalLoadActual.toFixed(1)),
      sumTransferredPlan: Number(sumTransferredPlan.toFixed(1)),
      sumTransferredActual: Number(sumTransferredActual.toFixed(1)),
    };
  }, [quarterRows]);

  const sankeyExplorerDataset = useMemo(() => loadSankeyExplorerDataset(), []);
  const sankeyDetailRows = sankeyExplorerDataset.dailyRows;

  /** 桑基明細表可用日期範圍（供 RE 累計預設區間） */
  const reDataDateSpan = useMemo(() => {
    if (!sankeyDetailRows.length) return { start: '', end: '' };
    const asc = [...sankeyDetailRows].sort((a, b) => a.dateLabel.localeCompare(b.dateLabel));
    return { start: asc[0].dateLabel, end: asc[asc.length - 1].dateLabel };
  }, [sankeyDetailRows]);

  const sankeyDisplayDateText = useMemo(() => `日期：${selectedSankeyDate}`, [selectedSankeyDate]);

  const sankeyExplorerYearOptions = useMemo(() => {
    const ys = new Set<number>();
    sankeyDetailRows.forEach((r) => ys.add(Number(r.dateLabel.slice(0, 4))));
    const cy = new Date().getFullYear();
    ys.add(cy);
    ys.add(cy + 1);
    return Array.from(ys).sort((a, b) => a - b);
  }, [sankeyDetailRows]);

  const sankeyMonthlyRowsForYear = useMemo(() => {
    return MONTH_NAMES_TW.map((label, idx) => {
      const month = idx + 1;
      const selectable = isSankeyMonthSelectable(sankeyExplorerYear, month);
      const agg = aggregateSankeyMonth(sankeyDetailRows as SankeyDetailDayRow[], sankeyExplorerYear, month);
      return { month, label, selectable, hasData: agg !== null, row: agg };
    });
  }, [sankeyDetailRows, sankeyExplorerYear]);

  const sankeyMonthlyRowsForYearSorted = useMemo(
    () => sortSankeyExplorerMonths(sankeyMonthlyRowsForYear, sankeyExplorerSort),
    [sankeyMonthlyRowsForYear, sankeyExplorerSort]
  );

  const sankeyDailyRowsInSelectedMonth = useMemo(() => {
    if (sankeyExplorerMonth == null) return [];
    return filterSankeyDaysChronological(
      sankeyDetailRows as SankeyDetailDayRow[],
      sankeyExplorerYear,
      sankeyExplorerMonth
    );
  }, [sankeyDetailRows, sankeyExplorerMonth, sankeyExplorerYear]);

  const sankeyDailyRowsForExplorer = useMemo(() => {
    if (sankeyExplorerView !== 'daily' || sankeyExplorerMonth == null) return [];
    return sortSankeyExplorerDates(sankeyDailyRowsInSelectedMonth, sankeyExplorerSort);
  }, [sankeyDailyRowsInSelectedMonth, sankeyExplorerMonth, sankeyExplorerSort, sankeyExplorerView]);

  const sankeySelectableMonths = useMemo(
    () =>
      sankeyMonthlyRowsForYear
        .filter((m) => m.selectable)
        .map((m) => m.month)
        .sort((a, b) => a - b),
    [sankeyMonthlyRowsForYear]
  );

  const sankeyMonthNavBounds = useMemo(() => {
    const idx =
      sankeyExplorerMonth != null ? sankeySelectableMonths.indexOf(sankeyExplorerMonth) : -1;
    return {
      canPrev: idx > 0,
      canNext: idx >= 0 && idx < sankeySelectableMonths.length - 1,
    };
  }, [sankeyExplorerMonth, sankeySelectableMonths]);

  const sankeyDayNavBounds = useMemo(() => {
    const days = sankeyDailyRowsInSelectedMonth;
    const idx = sankeyExplorerDay ? days.findIndex((d) => d.dateLabel === sankeyExplorerDay) : -1;
    const monthIdx =
      sankeyExplorerMonth != null ? sankeySelectableMonths.indexOf(sankeyExplorerMonth) : -1;
    const hasPrevMonth = monthIdx > 0;
    const hasNextMonth = monthIdx >= 0 && monthIdx < sankeySelectableMonths.length - 1;
    return {
      days,
      idx,
      canPrev: idx > 0 || hasPrevMonth,
      canNext: (idx >= 0 && idx < days.length - 1) || hasNextMonth,
    };
  }, [sankeyDailyRowsInSelectedMonth, sankeyExplorerDay, sankeyExplorerMonth, sankeySelectableMonths]);

  const openSankeyQuarterDetail = useCallback((dateLabel: string) => {
    const [, mm] = dateLabel.slice(0, 10).split('-').map(Number);
    if (mm) setSankeyExplorerMonth(mm);
    setSankeyExplorerView('quarter');
    setSankeyExplorerDay(dateLabel);
    setSelectedSankeyDate(dateLabel);
  }, []);

  const stepSankeyExplorerMonth = useCallback(
    (delta: -1 | 1) => {
      if (sankeyExplorerMonth == null) return;
      const idx = sankeySelectableMonths.indexOf(sankeyExplorerMonth);
      const month = sankeySelectableMonths[idx + delta];
      if (month == null) return;
      setSankeyExplorerMonth(month);
      setSankeyExplorerDay(null);
      setSelectedSankeyDate(ymd(sankeyExplorerYear, month, 1));
      if (sankeyExplorerView === 'quarter') {
        const days = filterSankeyDaysChronological(
          sankeyDetailRows as SankeyDetailDayRow[],
          sankeyExplorerYear,
          month
        );
        const pick = delta < 0 ? days[days.length - 1] : days[0];
        if (pick) {
          setSankeyExplorerDay(pick.dateLabel);
          setSelectedSankeyDate(pick.dateLabel);
        } else {
          setSankeyExplorerView('daily');
        }
      }
    },
    [sankeyDetailRows, sankeyExplorerMonth, sankeyExplorerView, sankeyExplorerYear, sankeySelectableMonths]
  );

  const stepSankeyExplorerDay = useCallback(
    (delta: -1 | 1) => {
      const { days, idx } = sankeyDayNavBounds;
      if (!sankeyExplorerDay || idx < 0) return;
      const nextIdx = idx + delta;
      if (nextIdx >= 0 && nextIdx < days.length) {
        const next = days[nextIdx];
        setSankeyExplorerDay(next.dateLabel);
        setSelectedSankeyDate(next.dateLabel);
        return;
      }
      const monthIdx =
        sankeyExplorerMonth != null ? sankeySelectableMonths.indexOf(sankeyExplorerMonth) : -1;
      const adjacentMonth = sankeySelectableMonths[monthIdx + delta];
      if (adjacentMonth == null) return;
      const adjacentDays = filterSankeyDaysChronological(
        sankeyDetailRows as SankeyDetailDayRow[],
        sankeyExplorerYear,
        adjacentMonth
      );
      const pick = delta < 0 ? adjacentDays[adjacentDays.length - 1] : adjacentDays[0];
      if (!pick) return;
      setSankeyExplorerMonth(adjacentMonth);
      setSankeyExplorerDay(pick.dateLabel);
      setSelectedSankeyDate(pick.dateLabel);
    },
    [
      sankeyDayNavBounds,
      sankeyDetailRows,
      sankeyExplorerDay,
      sankeyExplorerMonth,
      sankeyExplorerYear,
      sankeySelectableMonths,
    ]
  );

  const energyFlowDrill: EnergyFlowDrill = useMemo(() => {
    if (sankeyExplorerView === 'quarter') return 'day';
    if (sankeyExplorerView === 'daily') return 'month';
    return 'year';
  }, [sankeyExplorerView]);

  const energyFlowAggregate = useMemo((): EnergyFlowAggregate => {
    let rows: SankeyDetailDayRow[] = [];
    let periodLabel = `${sankeyExplorerYear} 年`;

    if (sankeyExplorerView === 'quarter' && sankeyExplorerDay) {
      const dayRow = (sankeyDetailRows as SankeyDetailDayRow[]).find((r) => r.dateLabel === sankeyExplorerDay);
      rows = dayRow ? [dayRow] : [];
      periodLabel = sankeyExplorerDay;
    } else if (sankeyExplorerView === 'daily' && sankeyExplorerMonth != null) {
      rows = sankeyDailyRowsForExplorer;
      periodLabel = `${sankeyExplorerYear} 年 ${MONTH_NAMES_TW[sankeyExplorerMonth - 1]}`;
    } else {
      rows = (sankeyDetailRows as SankeyDetailDayRow[]).filter((r) =>
        r.dateLabel.startsWith(`${sankeyExplorerYear}-`)
      );
    }

    const sums = sumSankeyDetailRows(rows);
    return {
      ...sums,
      dayCount: rows.length,
      periodLabel,
    };
  }, [
    sankeyDailyRowsForExplorer,
    sankeyDetailRows,
    sankeyExplorerDay,
    sankeyExplorerMonth,
    sankeyExplorerView,
    sankeyExplorerYear,
  ]);

  const explorerQuarterRows = useMemo(() => {
    if (!sankeyExplorerDay) return [];
    return sankeyExplorerDataset.quarterRowsByDate.get(sankeyExplorerDay) ?? [];
  }, [sankeyExplorerDay, sankeyExplorerDataset]);

  const explorerDayPrevBalance = useMemo(() => {
    if (!sankeyExplorerDay) return 6;
    const asc = [...(sankeyDetailRows as SankeyDetailDayRow[])].sort((a, b) =>
      a.dateLabel.localeCompare(b.dateLabel)
    );
    const idx = asc.findIndex((r) => r.dateLabel === sankeyExplorerDay);
    if (idx <= 0) return 6;
    return asc[idx - 1].storageBalance;
  }, [sankeyDetailRows, sankeyExplorerDay]);

  const explorerQuarterDisplay = useMemo(() => {
    if (explorerQuarterRows.length === 0) return [];
    let run = explorerDayPrevBalance;
    return explorerQuarterRows.map((row) => {
      const stIn = Math.max(row.storageActual, 0);
      const stOut = Math.max(-row.storageActual, 0);
      run = Number((run + row.storageActual).toFixed(3));
      const contractMatched = Number(Math.min(row.generationActual, row.loadActual * 0.35).toFixed(3));
      const totalMatched = Number((contractMatched + stOut).toFixed(3));
      return { row, stIn, stOut, runBalance: run, contractMatched, totalMatched };
    });
  }, [explorerDayPrevBalance, explorerQuarterRows]);

  const storageSettlementQuarterRows = useMemo(
    () =>
      quarterRows
        .filter((r) => r.storagePlan !== 0 || r.storageActual !== 0)
        .map((r) => ({
          timeLabel: r.timeLabel,
          plan: r.storagePlan,
          actual: r.storageActual,
          delta: Number((r.storageActual - r.storagePlan).toFixed(3)),
          consistent: Math.abs(r.storageActual - r.storagePlan) <= 1,
        })),
    [quarterRows]
  );

  const [styleMode] = useState<SankeyStyleMode>(defaultStyleMode);
  const [granularity] = useState<SankeyGranularity>('summary4h');
  const [sankeyFlowView, setSankeyFlowView] = useState<SankeyFlowView>('main');
  const [showGeneratorMeterId] = useState(true);
  const [showLoadMeterId] = useState(true);
  const [cExpanded] = useState(false);
  const [showStorageTable, setShowStorageTable] = useState(false);
  const [notedDays, setNotedDays] = useState<Record<string, boolean>>({});
  const [slotOverrides, setSlotOverrides] = useState<
    Record<
      string,
      { generationActual?: number; loadActual?: number; storageActual?: number; reason?: string }
    >
  >({});
  const [slotVendorOk, setSlotVendorOk] = useState<Record<string, boolean>>({});
  const [editTarget, setEditTarget] = useState<{
    slotKey: string;
    timeLabel: string;
    generationOriginal: number;
    loadOriginal: number;
    storageOriginal: number;
    draftGeneration: string;
    draftLoad: string;
    draftStorage: string;
    reason: string;
  } | null>(null);
  const [saveToast, setSaveToast] = useState(false);
  const [detailFocus, setDetailFocus] = useState<SankeyDetailFocus | null>(null);

  const detailPeriodDates = useMemo(() => {
    if (sankeyExplorerView === 'quarter' && sankeyExplorerDay) return [sankeyExplorerDay];
    if (sankeyExplorerView === 'daily' && sankeyExplorerMonth != null) {
      return sankeyDailyRowsForExplorer.map((r) => r.dateLabel);
    }
    return (sankeyDetailRows as SankeyDetailDayRow[])
      .filter((r) => r.dateLabel.startsWith(`${sankeyExplorerYear}-`))
      .map((r) => r.dateLabel);
  }, [
    sankeyDailyRowsForExplorer,
    sankeyDetailRows,
    sankeyExplorerDay,
    sankeyExplorerMonth,
    sankeyExplorerView,
    sankeyExplorerYear,
  ]);

  const sankeyFlowLinks = useMemo(
    () => buildSankeyChartFromDates(detailPeriodDates),
    [detailPeriodDates]
  );

  const openPeriodMetric = useCallback(
    (metric: SankeyMetricFocus, dateLabels: string[], periodLabel: string) => {
      setDetailFocus({ kind: 'period', periodLabel, dateLabels, metric });
    },
    []
  );

  const openSlotMetric = useCallback(
    (timeLabel: string, metric: SankeyMetricFocus) => {
      if (!sankeyExplorerDay) return;
      setDetailFocus({
        kind: 'slot',
        periodLabel: sankeyExplorerDay,
        dateLabel: sankeyExplorerDay,
        timeLabel,
        metric,
      });
    },
    [sankeyExplorerDay]
  );

  const handleSankeyInteraction = useCallback(
    (payload: SankeyClickPayload) => {
      if (payload.type === 'node') {
        setDetailFocus({
          kind: 'node',
          periodLabel: energyFlowAggregate.periodLabel,
          dateLabels: detailPeriodDates,
          nodeName: payload.name,
        });
      } else {
        setDetailFocus({
          kind: 'edge',
          periodLabel: energyFlowAggregate.periodLabel,
          dateLabels: detailPeriodDates,
          sourceNode: payload.source,
          targetNode: payload.target,
        });
      }
    },
    [detailPeriodDates, energyFlowAggregate.periodLabel]
  );

  const monthDateLabels = useCallback(
    (month: number) =>
      (sankeyDetailRows as SankeyDetailDayRow[])
        .filter((r) => {
          const [, mm] = r.dateLabel.split('-');
          return r.dateLabel.startsWith(`${sankeyExplorerYear}-`) && Number(mm) === month;
        })
        .map((r) => r.dateLabel),
    [sankeyDetailRows, sankeyExplorerYear]
  );

  const commitSlotEdit = useCallback(() => {
    if (!editTarget) return;
    const reason = editTarget.reason.trim();
    if (!reason) {
      window.alert('請寫原因');
      return;
    }
    const generationActual = Number(editTarget.draftGeneration);
    const loadActual = Number(editTarget.draftLoad);
    const storageActual = Number(editTarget.draftStorage);
    if (
      !Number.isFinite(generationActual) ||
      !Number.isFinite(loadActual) ||
      !Number.isFinite(storageActual)
    ) {
      return;
    }
    setSlotOverrides((prev) => ({
      ...prev,
      [editTarget.slotKey]: {
        generationActual,
        loadActual,
        storageActual,
        reason,
      },
    }));
    setEditTarget(null);
    setSaveToast(true);
  }, [editTarget]);

  const explorerQuarterDisplayResolved = useMemo(() => {
    if (explorerQuarterDisplay.length === 0 || !sankeyExplorerDay) return explorerQuarterDisplay;
    let run = explorerDayPrevBalance;
    return explorerQuarterDisplay.map((line) => {
      const sk = `${sankeyExplorerDay}@${line.row.slotIndex}`;
      const ovr = slotOverrides[sk] ?? {};
      const generationActual = ovr.generationActual ?? line.row.generationActual;
      const loadActual = ovr.loadActual ?? line.row.loadActual;
      const storageActual = ovr.storageActual ?? line.row.storageActual;
      const stIn = Math.max(storageActual, 0);
      const stOut = Math.max(-storageActual, 0);
      run = Number((run + storageActual).toFixed(3));
      const contractMatched = Number(Math.min(generationActual, loadActual * 0.35).toFixed(3));
      const totalMatched = Number((contractMatched + stOut).toFixed(3));
      return {
        ...line,
        row: { ...line.row, generationActual, loadActual, storageActual },
        stIn,
        stOut,
        runBalance: run,
        contractMatched,
        totalMatched,
      };
    });
  }, [explorerDayPrevBalance, explorerQuarterDisplay, sankeyExplorerDay, slotOverrides]);

  /** RE 年度目標（%）；累計區間起迄可自訂，預設帶入資料可用範圍 */
  const [reAnnualTargetPct, setReAnnualTargetPct] = useState(90);
  const [reCumStart, setReCumStart] = useState('');
  const [reCumEnd, setReCumEnd] = useState('');

  const reRangeStart = reCumStart || reDataDateSpan.start;
  const reRangeEnd = reCumEnd || reDataDateSpan.end;

  const cumulativeReForRange = useMemo(() => {
    if (!reRangeStart || !reRangeEnd) {
      return { sumMatched: 0, sumLoad: 0, rePct: 0, dayCount: 0 };
    }
    const start = new Date(`${reRangeStart}T00:00:00`);
    const end = new Date(`${reRangeEnd}T23:59:59`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return { sumMatched: 0, sumLoad: 0, rePct: 0, dayCount: 0 };
    }
    const rows = sankeyDetailRows.filter((row) => {
      const t = new Date(`${row.dateLabel.slice(0, 10)}T12:00:00`).getTime();
      return t >= start.getTime() && t <= end.getTime();
    });
    const sumMatched = rows.reduce((s, r) => s + r.totalMatched, 0);
    const sumLoad = rows.reduce((s, r) => s + r.load, 0);
    const rePct = sumLoad > 0 ? (sumMatched / sumLoad) * 100 : 0;
    return {
      sumMatched: Number(sumMatched.toFixed(1)),
      sumLoad: Number(sumLoad.toFixed(1)),
      rePct: Number(rePct.toFixed(2)),
      dayCount: rows.length,
    };
  }, [sankeyDetailRows, reRangeStart, reRangeEnd]);

  const reVsTargetDiff = Number((cumulativeReForRange.rePct - reAnnualTargetPct).toFixed(2));

  const reAchievementTooltip =
    'RE 累計達成率計算方式：將下方自訂「起日～迄日」區間內，每日「總匹配量（儲能提領＋合約匹配量）」加總為分子；同一區間內每日「用電端」用電量加總為分母；達成率＝分子÷分母×100%。數值單位為示範資料之 kWh。';

  const effectiveGranularity: SankeyGranularity = styleMode === 'ab' ? granularity : cExpanded ? 'detail24h' : 'summary4h';
  const activeHourlyRows = useMemo(() => buildHourlyRowsByDate(selectedSankeyDate), [selectedSankeyDate]);
  const previousDayStorageBalance = useMemo(() => {
    const idx = sankeyDetailRows.findIndex((row) => row.dateLabel === selectedSankeyDate);
    if (idx >= 0 && idx < sankeyDetailRows.length - 1) return sankeyDetailRows[idx + 1].storageBalance;
    return sankeyDetailRows[0]?.storageBalance ?? 0;
  }, [sankeyDetailRows, selectedSankeyDate]);

  useEffect(() => {
    if (sankeyExplorerView === 'quarter' && sankeyExplorerDay) {
      setSelectedSankeyDate(sankeyExplorerDay);
    }
  }, [sankeyExplorerView, sankeyExplorerDay]);

  useEffect(() => {
    if (!saveToast) return;
    const t = window.setTimeout(() => setSaveToast(false), 800);
    return () => window.clearTimeout(t);
  }, [saveToast]);

  const sankeyModel = useMemo(() => {
    if (sankeyFlowView === 'charge') {
      const chargeHours = activeHourlyRows.filter((row) => row.hour >= 10 && row.hour <= 14);
      const generatorMeters = ['G-101', 'G-102', 'G-103', 'G-104', 'G-105'];
      const storageAccount = '儲能帳戶（充電）';
      const nodes = [
        ...chargeHours.map((row, idx) => ({
          name: showGeneratorMeterId
            ? `${generatorMeters[idx % generatorMeters.length]}｜太陽能｜${String(row.hour).padStart(2, '0')}:00`
            : `發電端｜${String(row.hour).padStart(2, '0')}:00`,
          itemStyle: { color: '#f59e0b' },
          label: { position: 'right' as const },
        })),
        { name: storageAccount, itemStyle: { color: '#7c3aed' }, label: { position: 'right' as const } },
      ];
      const links = chargeHours.map((row, idx) => {
        const chargeValue = Number(Math.max(row.storageActual, row.generationActual * 0.1, 0.1).toFixed(1));
        return {
          source: showGeneratorMeterId
            ? `${generatorMeters[idx % generatorMeters.length]}｜太陽能｜${String(row.hour).padStart(2, '0')}:00`
            : `發電端｜${String(row.hour).padStart(2, '0')}:00`,
          target: storageAccount,
          value: chargeValue,
        };
      });
      const totalCharge = links.reduce((sum, link) => sum + link.value, 0);
      return {
        nodes,
        links,
        summary: {
          totalContract: 0,
          totalStorageFlow: Number(totalCharge.toFixed(1)),
          totalUnfulfilled: 0,
        },
      };
    }

    if (sankeyFlowView === 'discharge') {
      const dischargeHours = activeHourlyRows.filter((row) => row.hour >= 16 && row.hour <= 20);
      const loadMeters = ['L-501', 'L-502', 'L-503', 'L-504', 'L-505'];
      const storageAccount = '儲能帳戶（放電）';
      const nodes = [
        { name: storageAccount, itemStyle: { color: '#7c3aed' }, label: { position: 'right' as const } },
        ...dischargeHours.map((row, idx) => ({
          name: showLoadMeterId
            ? `${loadMeters[idx % loadMeters.length]}｜用電端｜${String(row.hour).padStart(2, '0')}:00`
            : `用電端｜${String(row.hour).padStart(2, '0')}:00`,
          itemStyle: { color: '#2563eb' },
          label: { position: 'right' as const },
        })),
      ];
      const links = dischargeHours.map((row, idx) => {
        const dischargeValue = Number(Math.max(-row.storageActual, row.loadActual * 0.08, 0.1).toFixed(1));
        return {
          source: storageAccount,
          target: showLoadMeterId
            ? `${loadMeters[idx % loadMeters.length]}｜用電端｜${String(row.hour).padStart(2, '0')}:00`
            : `用電端｜${String(row.hour).padStart(2, '0')}:00`,
          value: dischargeValue,
        };
      });
      const totalDischarge = links.reduce((sum, link) => sum + link.value, 0);
      return {
        nodes,
        links,
        summary: {
          totalContract: 0,
          totalStorageFlow: Number(totalDischarge.toFixed(1)),
          totalUnfulfilled: 0,
        },
      };
    }

    const selectedRows = pickRowsByGranularity(activeHourlyRows, effectiveGranularity);
    const generatorMeters = ['G-101', 'G-102', 'G-103', 'G-104', 'G-105', 'G-106'];
    const generatorResources = ['太陽能', '風力', '水力', '生質能', '太陽能', '風力'];
    const loadMeters = ['L-501', 'L-502', 'L-503', 'L-504', 'L-505', 'L-506'];
    const leftNodes = selectedRows.map((row, idx) =>
      showGeneratorMeterId
        ? `${generatorMeters[idx % generatorMeters.length]}｜${generatorResources[idx % generatorResources.length]}｜${String(row.hour).padStart(2, '0')}:00`
        : `發電端 ${String(row.hour).padStart(2, '0')}:00 (${row.generationActual.toFixed(1)}度)`
    );
    const middleContract = 'ECVN合約與調節帳戶｜合約履行';
    const middleStorage = 'ECVN合約與調節帳戶｜儲能調節帳戶';
    const middleStorageBalance = 'ECVN合約與調節帳戶｜儲能餘額';
    const middleSurplus = 'ECVN合約與調節帳戶｜未履約餘電';
    const leftPrevDayStorage = `前一天儲能餘額 (${previousDayStorageBalance.toFixed(1)}度)`;
    const rightContractUser = '合約用戶（匹配成功）';
    const rightDischargeWindow = '儲能提領時段 16:00-20:00';
    const rightLoadMeterNodes = selectedRows.map((row, idx) =>
      showLoadMeterId
        ? `${loadMeters[idx % loadMeters.length]}｜${String(row.hour).padStart(2, '0')}:00`
        : `用電端 ${String(row.hour).padStart(2, '0')}:00`
    );
    const rightStorageTimeNodes = selectedRows.map(
      (row) => `儲能 ${String(row.hour).padStart(2, '0')}:00 (${Math.max(Math.abs(row.storageActual), 0.1).toFixed(1)}度)`
    );
    const rightStorageBucket = '儲能時段總覽（點擊展開24時段）';
    const rightStorageBalance = '儲能餘額';
    const rightSurplus = '餘電';
    const showStorageHours = styleMode === 'ab' || cExpanded;
    const storageHourTargets = showStorageHours ? rightStorageTimeNodes : [rightStorageBucket];

    const nodes: Array<{ name: string; itemStyle?: { color: string }; label?: { position: 'left' | 'right' | 'inside' } }> = [
      ...leftNodes.map((name) => ({ name, itemStyle: { color: '#f59e0b' }, label: { position: 'right' as const } })),
      { name: leftPrevDayStorage, itemStyle: { color: '#0f766e' }, label: { position: 'right' as const } },
      { name: middleContract, itemStyle: { color: '#4f46e5' }, label: { position: 'right' as const } },
      { name: middleStorage, itemStyle: { color: '#7c3aed' }, label: { position: 'right' as const } },
      { name: middleStorageBalance, itemStyle: { color: '#5b21b6' }, label: { position: 'right' as const } },
      { name: middleSurplus, itemStyle: { color: '#a16207' }, label: { position: 'right' as const } },
      { name: rightContractUser, itemStyle: { color: '#2563eb' }, label: { position: 'right' as const } },
      { name: rightDischargeWindow, itemStyle: { color: '#1e40af' }, label: { position: 'right' as const } },
      ...rightLoadMeterNodes.map((name) => ({ name, itemStyle: { color: '#1d4ed8' }, label: { position: 'right' as const } })),
      ...storageHourTargets.map((name) => ({ name, itemStyle: { color: '#3b82f6' }, label: { position: 'right' as const } })),
      { name: rightStorageBalance, itemStyle: { color: '#10b981' }, label: { position: 'right' as const } },
      { name: rightSurplus, itemStyle: { color: '#f97316' }, label: { position: 'right' as const } },
    ];

    const links: Array<{ source: string; target: string; value: number }> = [];
    let totalContract = 0;
    let totalStorageFlow = 0;
    let totalUnfulfilled = 0;
    let totalStorageBalance = 0;
    let totalSurplus = 0;
    let totalLoadMeterSupply = 0;
    let totalStorageDischargeWindow = 0;
    let totalPrevDayContribution = 0;
    const prevDayCarry = Math.max(previousDayStorageBalance, 0);
    const prevDayAvailableForDischarge = prevDayCarry * 0.42;

    selectedRows.forEach((row, index) => {
      const left = showGeneratorMeterId
        ? `${generatorMeters[index % generatorMeters.length]}｜${generatorResources[index % generatorResources.length]}｜${String(row.hour).padStart(2, '0')}:00`
        : `發電端 ${String(row.hour).padStart(2, '0')}:00 (${row.generationActual.toFixed(1)}度)`;
      const gen = Math.max(row.generationActual, 0);
      const load = Math.max(row.loadActual, 0);
      const storageDispatch = Math.max(-row.storageActual, 0);
      const storageCharge = Math.max(row.storageActual, 0);
      const canChargeToStorage = row.hour >= 10 && row.hour <= 14;
      const canDischargeFromStorage = row.hour >= 16 && row.hour <= 20;
      const contractPart = Math.min(gen, load * 0.35);
      const storageAccountPart = canChargeToStorage ? Math.max(0, gen - contractPart - storageCharge) : 0;
      const unfulfilledPart = Math.max(0, gen - contractPart - storageAccountPart);
      const userMatched = Math.min(load, contractPart + storageAccountPart + storageDispatch);
      const storageBalancePart = Math.max(0, storageCharge - storageDispatch * 0.15);
      const surplusPart = Math.max(0, unfulfilledPart + Math.max(0, gen - userMatched - contractPart));

      totalContract += contractPart;
      totalStorageFlow += storageAccountPart;
      totalUnfulfilled += unfulfilledPart;
      totalStorageBalance += storageBalancePart;
      totalSurplus += surplusPart;

      links.push({ source: left, target: middleContract, value: Number(contractPart.toFixed(1)) });
      links.push({ source: left, target: middleStorage, value: Number(storageAccountPart.toFixed(1)) });
      if (unfulfilledPart > 0.05) {
        links.push({ source: left, target: middleSurplus, value: Number(unfulfilledPart.toFixed(1)) });
      }
      const storageToHour = canDischargeFromStorage
        ? Number(Math.max(0, userMatched - Math.min(contractPart, userMatched) + storageDispatch * 0.25).toFixed(1))
        : 0;
      if (storageToHour > 0.05) {
        const storageTarget = storageHourTargets[Math.min(index, storageHourTargets.length - 1)];
        links.push({ source: middleStorage, target: storageTarget, value: storageToHour });
      }
      const loadMeterTarget = rightLoadMeterNodes[Math.min(index, rightLoadMeterNodes.length - 1)];
      const fromStorageToLoadMeter = canDischargeFromStorage
        ? Number(Math.max(0, Math.min(load * 0.2, storageAccountPart * 0.3 + storageDispatch * 0.3)).toFixed(1))
        : 0;
      if (fromStorageToLoadMeter > 0.05) {
        links.push({ source: middleStorage, target: loadMeterTarget, value: fromStorageToLoadMeter });
        totalLoadMeterSupply += fromStorageToLoadMeter;
        totalStorageDischargeWindow += fromStorageToLoadMeter;
      }
      if (canDischargeFromStorage && prevDayAvailableForDischarge > 0.05) {
        const carryShare = Number((prevDayAvailableForDischarge / 5).toFixed(1));
        if (carryShare > 0.05) {
          links.push({ source: middleStorageBalance, target: loadMeterTarget, value: carryShare });
          totalPrevDayContribution += carryShare;
          totalStorageDischargeWindow += carryShare;
        }
      }
    });

    if (prevDayCarry > 0.05) {
      links.push({ source: leftPrevDayStorage, target: middleStorage, value: Number(prevDayCarry.toFixed(1)) });
    }
    links.push({ source: middleContract, target: rightContractUser, value: Number(totalContract.toFixed(1)) });
    links.push({ source: middleStorage, target: middleStorageBalance, value: Number(totalStorageBalance.toFixed(1)) });
    links.push({ source: middleStorage, target: rightStorageBalance, value: Number(totalStorageBalance.toFixed(1)) });
    links.push({ source: middleStorageBalance, target: rightContractUser, value: Number(totalLoadMeterSupply.toFixed(1)) });
    links.push({ source: middleStorage, target: rightDischargeWindow, value: Number(totalStorageDischargeWindow.toFixed(1)) });
    links.push({ source: middleSurplus, target: rightSurplus, value: Number(Math.max(totalSurplus, totalUnfulfilled).toFixed(1)) });

    return {
      nodes,
      links: links.filter((l) => l.value > 0.05),
      summary: {
        totalContract: Number(totalContract.toFixed(1)),
        totalStorageFlow: Number((totalStorageFlow + totalLoadMeterSupply + totalPrevDayContribution).toFixed(1)),
        totalUnfulfilled: Number(totalUnfulfilled.toFixed(1)),
      },
    };
  }, [activeHourlyRows, effectiveGranularity, styleMode, cExpanded, sankeyFlowView, showGeneratorMeterId, showLoadMeterId, previousDayStorageBalance]);

  const sankeyOption = useMemo<EChartsOption>(
    () => ({
      animation: false,
      tooltip: { trigger: 'item' },
      series: [
        {
          type: 'sankey',
          left: 12,
          right: 170,
          top: 8,
          bottom: 8,
          emphasis: { focus: 'adjacency' },
          nodeWidth: 12,
          nodeGap: 7,
          draggable: true,
          lineStyle: { color: 'source', curveness: 0.45, opacity: 0.6 },
          label: {
            color: '#0f172a',
            fontSize: chartFonts.sankeyNode,
            fontWeight: 600,
            overflow: 'breakAll',
            position: 'right',
            distance: 8,
          },
          data: sankeyModel.nodes,
          links: sankeyModel.links,
        },
      ],
    }),
    [sankeyModel, chartFonts.sankeyNode]
  );

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      {pageHeading.startsWith('4.1') ? (
        <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">5.1 年度 RE 目標與累計達成率</h3>
              <p className="mt-0.5 max-w-2xl text-xs font-semibold text-slate-600">
                先設定統計區間與年度目標，下方指標依區間內累計匹配量與用電量即時計算。
              </p>
            </div>
            {reDataDateSpan.start && reDataDateSpan.end ? (
              <span className="rounded-full border border-indigo-200 bg-white/90 px-2.5 py-1 text-ui-10 font-bold text-indigo-800">
                資料可用 {reDataDateSpan.start}～{reDataDateSpan.end}
              </span>
            ) : null}
          </div>

          <div className="mt-3 rounded-xl border border-slate-200/90 bg-white/95 p-3 shadow-sm">
            <p className="mb-2 text-ui-10 font-black uppercase tracking-wide text-slate-500">區間與目標設定</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-3">
                <label className="mb-1 block text-ui-10 font-bold text-slate-600">起日</label>
                <input
                  type="date"
                  value={reCumStart || reDataDateSpan.start}
                  min={reDataDateSpan.start || undefined}
                  max={reDataDateSpan.end || undefined}
                  onChange={(e) => setReCumStart(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                />
              </div>
              <div className="lg:col-span-3">
                <label className="mb-1 block text-ui-10 font-bold text-slate-600">迄日</label>
                <input
                  type="date"
                  value={reCumEnd || reDataDateSpan.end}
                  min={reDataDateSpan.start || undefined}
                  max={reDataDateSpan.end || undefined}
                  onChange={(e) => setReCumEnd(e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                />
              </div>
              <div className="lg:col-span-2">
                <label className="mb-1 block text-ui-10 font-bold text-slate-600">RE 年度目標（%）</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.1}
                  value={reAnnualTargetPct}
                  onChange={(e) => setReAnnualTargetPct(Number(e.target.value))}
                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setReCumStart(reDataDateSpan.start);
                    setReCumEnd(reDataDateSpan.end);
                  }}
                  className="h-9 flex-1 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100 sm:flex-none"
                >
                  帶入資料全日區間
                </button>
              </div>
            </div>
            <p className="mt-2 text-ui-10 font-semibold text-slate-500">
              目前統計：{reRangeStart || '—'}～{reRangeEnd || '—'}
              {cumulativeReForRange.dayCount > 0 ? ` · ${cumulativeReForRange.dayCount} 日` : ''}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-12">
            <div className="col-span-2 rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-3 shadow-sm lg:col-span-5">
              <p className="text-ui-11 font-bold text-emerald-900">
                <span className="cursor-help border-b border-dotted border-emerald-700" title={reAchievementTooltip}>
                  RE 累計達成率
                </span>
              </p>
              <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
                <p className="text-3xl font-black tabular-nums leading-none text-emerald-800">
                  {cumulativeReForRange.rePct.toFixed(2)}%
                </p>
                <p className={`text-xs font-bold ${reVsTargetDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  與目標差 {reVsTargetDiff >= 0 ? '+' : ''}
                  {reVsTargetDiff.toFixed(2)}%
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-emerald-100">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.min(100, Math.max(0, cumulativeReForRange.rePct))}%` }}
                />
              </div>
              <p className="mt-1 text-ui-10 font-semibold text-slate-500">目標線 {reAnnualTargetPct.toFixed(1)}%</p>
            </div>

            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-2.5 shadow-sm lg:col-span-2">
              <p className="text-ui-11 font-bold text-slate-500">RE 年度目標</p>
              <p className="mt-0.5 text-2xl font-black tabular-nums text-indigo-800">{reAnnualTargetPct.toFixed(1)}%</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm lg:col-span-2">
              <p className="text-ui-11 font-bold text-slate-500">累計成功匹配量</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900">
                {cumulativeReForRange.sumMatched.toFixed(1)}
              </p>
              <p className="text-ui-10 font-semibold text-slate-500">kWh</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm lg:col-span-3">
              <p className="text-ui-11 font-bold text-slate-500">累計用電量</p>
              <p className="mt-0.5 text-xl font-black tabular-nums text-slate-900">
                {cumulativeReForRange.sumLoad.toFixed(1)}
              </p>
              <p className="text-ui-10 font-semibold text-slate-500">kWh · 區間 {cumulativeReForRange.dayCount} 日</p>
            </div>
          </div>

          <SettlementEnergyFlowSankey
            drill={energyFlowDrill}
            aggregate={energyFlowAggregate}
            flowLinks={sankeyFlowLinks}
            embedded
            onSankeyInteraction={handleSankeyInteraction}
          />
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">{pageHeading}</h3>
        <div className="mb-5 mt-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-black text-slate-900">
            桑基匹配明細表（依年度彙總；可下鑽至日與 15 分鐘並編輯示範數值）
          </p>
          <p className="mb-3 text-xs font-semibold text-slate-600">
            選擇年度後，已結算月份可點選；未結算月份為灰色。由【詳細資料】進入每日明細，再進入 15
            分鐘可編輯量測值並填寫原因；異常以紅色標示，廠商確認後改為綠色。表格數值與上方桑基圖節點／連線可點擊，開啟 G1～G5、L1～L5 與流向組成明細。
          </p>
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="mb-1 block text-ui-10 font-bold text-slate-600">資料年度</label>
              <select
                value={sankeyExplorerYear}
                onChange={(e) => {
                  setSankeyExplorerYear(Number(e.target.value));
                  setSankeyExplorerView('year');
                  setSankeyExplorerMonth(null);
                  setSankeyExplorerDay(null);
                }}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800"
              >
                {sankeyExplorerYearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y} 年
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              <span className="w-full text-ui-10 font-bold text-slate-600">月份（已結算可點）</span>
              <div className="flex w-full flex-wrap gap-1.5">
                {sankeyMonthlyRowsForYear.map(({ month, label, selectable }) => (
                  <button
                    key={month}
                    type="button"
                    disabled={!selectable}
                    onClick={() => {
                      if (!selectable) return;
                      if (
                        sankeyExplorerMonth === month &&
                        (sankeyExplorerView === 'daily' || sankeyExplorerView === 'quarter')
                      ) {
                        setSankeyExplorerView('year');
                        setSankeyExplorerMonth(null);
                        setSankeyExplorerDay(null);
                        return;
                      }
                      setSankeyExplorerMonth(month);
                      setSankeyExplorerView('daily');
                      setSankeyExplorerDay(null);
                      setSelectedSankeyDate(ymd(sankeyExplorerYear, month, 1));
                    }}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                      selectable
                        ? sankeyExplorerMonth === month
                          ? 'bg-blue-700 text-white'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                        : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {sankeyExplorerView === 'quarter' ? (
                <>
                  <button
                    type="button"
                    disabled={!sankeyDayNavBounds.canPrev}
                    onClick={() => stepSankeyExplorerDay(-1)}
                    className={SANKEY_NAV_BTN}
                  >
                    ◀ 往前
                  </button>
                  <button
                    type="button"
                    disabled={!sankeyDayNavBounds.canNext}
                    onClick={() => stepSankeyExplorerDay(1)}
                    className={SANKEY_NAV_BTN}
                  >
                    往後 ▶
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSankeyExplorerView('daily');
                      setSankeyExplorerDay(null);
                    }}
                    className={SANKEY_BACK_BTN}
                  >
                    ← 返回每日
                  </button>
                </>
              ) : null}
              {sankeyExplorerView === 'daily' ? (
                <>
                  <button
                    type="button"
                    disabled={!sankeyMonthNavBounds.canPrev}
                    onClick={() => stepSankeyExplorerMonth(-1)}
                    className={SANKEY_NAV_BTN}
                  >
                    ◀ 往前
                  </button>
                  <button
                    type="button"
                    disabled={!sankeyMonthNavBounds.canNext}
                    onClick={() => stepSankeyExplorerMonth(1)}
                    className={SANKEY_NAV_BTN}
                  >
                    往後 ▶
                  </button>
                </>
              ) : null}
              {sankeyExplorerView === 'daily' || sankeyExplorerView === 'quarter' ? (
                <button
                  type="button"
                  onClick={() => {
                    setSankeyExplorerView('year');
                    setSankeyExplorerMonth(null);
                    setSankeyExplorerDay(null);
                  }}
                  className={SANKEY_BACK_BTN}
                >
                  ← 返回年度
                </button>
              ) : null}
              {sankeyExplorerView === 'year' || sankeyExplorerView === 'daily' ? (
                <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                  <span className="whitespace-nowrap">排序</span>
                  <select
                    value={sankeyExplorerSort}
                    onChange={(e) => setSankeyExplorerSort(e.target.value as SankeyExplorerSort)}
                    className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800"
                  >
                    <option value="desc">日期 新→舊</option>
                    <option value="asc">日期 舊→新</option>
                  </select>
                </label>
              ) : null}
              {sankeyExplorerView === 'quarter' && sankeyExplorerDay ? (
                <span className="text-xs font-bold text-slate-600">15 分鐘 · {sankeyExplorerDay}</span>
              ) : null}
              {sankeyExplorerView === 'daily' && sankeyExplorerMonth != null ? (
                <span className="text-xs font-bold text-slate-600">
                  每日明細 · {sankeyExplorerYear} 年 {MONTH_NAMES_TW[sankeyExplorerMonth - 1]}
                </span>
              ) : null}
            </div>
          </div>
          <div
            id="sankey-explorer-table"
            className="flex min-h-0 w-full flex-col overflow-hidden rounded-lg border border-slate-200"
          >
            <div
              ref={sankeyExplorerScrollRef}
              className={
                sankeyExplorerView === 'quarter'
                  ? 'sankey-table-scroll min-h-0 h-[min(520px,58vh)] w-full overflow-x-auto overflow-y-auto overscroll-y-contain'
                  : 'sankey-table-scroll min-h-0 max-h-[560px] w-full overflow-x-auto overflow-y-auto overscroll-y-contain'
              }
            >
            {sankeyExplorerView === 'year' ? (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">月份</th>
                    <th className="px-3 py-2 text-right font-bold">發電端</th>
                    <th className="px-3 py-2 text-right font-bold">用電端</th>
                    <th className="px-3 py-2 text-right font-bold">
                      <button
                        type="button"
                        className="font-bold text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => {
                          setSankeyFlowView('charge');
                          const anchor = document.getElementById('sankey-mode-anchor');
                          if (anchor) {
                            const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                          }
                        }}
                      >
                        儲能存入(+)
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-bold">
                      <button
                        type="button"
                        className="font-bold text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => {
                          setSankeyFlowView('discharge');
                          const anchor = document.getElementById('sankey-mode-anchor');
                          if (anchor) {
                            const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                          }
                        }}
                      >
                        儲能提領(-)
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right font-bold">儲能餘額(∑)</th>
                    <th className="px-3 py-2 text-right font-bold text-blue-700">合約匹配量</th>
                    <th className="px-3 py-2 text-right font-bold text-blue-700">總匹配量</th>
                    <th className="px-3 py-2 text-center font-bold">操作</th>
                  </tr>
                </thead>
                <tbody className="text-slate-900">
                  {sankeyMonthlyRowsForYearSorted.map(({ month, label, selectable, row }) => {
                    const z =
                      row ??
                      ({
                        generation: 0,
                        load: 0,
                        storageIn: 0,
                        storageOut: 0,
                        storageBalance: 0,
                        contractMatched: 0,
                        totalMatched: 0,
                      } as SankeyDetailDayRow);
                    return (
                      <tr key={month} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-bold">{label}</td>
                        <td className="px-3 py-2 text-right">
                          <SankeyMetricButton
                            value={z.generation}
                            decimals={1}
                            onClick={() =>
                              openPeriodMetric(
                                'generation',
                                monthDateLabels(month),
                                `${sankeyExplorerYear} 年 ${label}`
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <SankeyMetricButton
                            value={z.load}
                            decimals={1}
                            onClick={() =>
                              openPeriodMetric('load', monthDateLabels(month), `${sankeyExplorerYear} 年 ${label}`)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <button
                            type="button"
                            className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                            onClick={() => {
                              setSelectedSankeyDate(ymd(sankeyExplorerYear, month, 1));
                              setSankeyFlowView('charge');
                              const anchor = document.getElementById('sankey-mode-anchor');
                              if (anchor) {
                                const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                                window.scrollTo({ top: y, behavior: 'smooth' });
                              }
                            }}
                          >
                            {z.storageIn.toFixed(1)}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <button
                            type="button"
                            className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                            onClick={() => {
                              setSelectedSankeyDate(ymd(sankeyExplorerYear, month, 1));
                              setSankeyFlowView('discharge');
                              const anchor = document.getElementById('sankey-mode-anchor');
                              if (anchor) {
                                const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                                window.scrollTo({ top: y, behavior: 'smooth' });
                              }
                            }}
                          >
                            {z.storageOut.toFixed(1)}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <SankeyMetricButton
                            value={z.storageBalance}
                            decimals={1}
                            onClick={() =>
                              openPeriodMetric('balance', monthDateLabels(month), `${sankeyExplorerYear} 年 ${label}`)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-blue-700">
                          <SankeyMetricButton
                            value={z.contractMatched}
                            decimals={1}
                            className="text-blue-700"
                            onClick={() =>
                              openPeriodMetric('contract', monthDateLabels(month), `${sankeyExplorerYear} 年 ${label}`)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700">
                          <SankeyMetricButton
                            value={z.totalMatched}
                            decimals={1}
                            className="text-blue-700"
                            onClick={() =>
                              openPeriodMetric('total', monthDateLabels(month), `${sankeyExplorerYear} 年 ${label}`)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            disabled={!selectable}
                            onClick={() => {
                              if (!selectable) return;
                              setSankeyExplorerView('daily');
                              setSankeyExplorerMonth(month);
                              setSelectedSankeyDate(ymd(sankeyExplorerYear, month, 1));
                            }}
                            className={`rounded-md border px-2 py-1 text-xs font-bold ${
                              selectable
                                ? 'border-blue-600 bg-blue-50 text-blue-800 hover:bg-blue-100'
                                : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                            }`}
                          >
                            詳細資料
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : null}
            {sankeyExplorerView === 'daily' && sankeyExplorerMonth != null ? (
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">日期</th>
                      <th className="px-3 py-2 text-right font-bold">發電端</th>
                      <th className="px-3 py-2 text-right font-bold">用電端</th>
                      <th className="px-3 py-2 text-right font-bold">儲能存入(+)</th>
                      <th className="px-3 py-2 text-right font-bold">儲能提領(-)</th>
                      <th className="px-3 py-2 text-right font-bold">儲能餘額(∑)</th>
                      <th className="px-3 py-2 text-right font-bold text-blue-700">合約匹配量</th>
                      <th className="px-3 py-2 text-right font-bold text-blue-700">總匹配量</th>
                      <th className="px-3 py-2 text-center font-bold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sankeyDailyRowsForExplorer.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                          本月示範資料尚無列；可換選有資料的月份或調整年度。
                        </td>
                      </tr>
                    ) : (
                      sankeyDailyRowsForExplorer.map((row) => (
                        <tr key={row.dateLabel} className="border-t border-slate-200 text-slate-900">
                          <td className="px-3 py-2 font-semibold">
                            <button
                              type="button"
                              onClick={() => openSankeyQuarterDetail(row.dateLabel)}
                              className="text-blue-800 underline-offset-2 hover:underline"
                            >
                              {row.dateLabel}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.generation}
                              decimals={1}
                              onClick={() => openPeriodMetric('generation', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.load}
                              decimals={1}
                              onClick={() => openPeriodMetric('load', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.storageIn}
                              decimals={1}
                              onClick={() => openPeriodMetric('storageIn', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.storageOut}
                              decimals={1}
                              onClick={() => openPeriodMetric('storageOut', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <SankeyMetricButton
                              value={row.storageBalance}
                              decimals={1}
                              onClick={() => openPeriodMetric('balance', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-blue-700">
                            <SankeyMetricButton
                              value={row.contractMatched}
                              decimals={1}
                              className="text-blue-700"
                              onClick={() => openPeriodMetric('contract', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">
                            <SankeyMetricButton
                              value={row.totalMatched}
                              decimals={1}
                              className="text-blue-700"
                              onClick={() => openPeriodMetric('total', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  setNotedDays((p) => {
                                    if (p[row.dateLabel]) {
                                      const next = { ...p };
                                      delete next[row.dateLabel];
                                      return next;
                                    }
                                    return { ...p, [row.dateLabel]: true };
                                  })
                                }
                                className={`rounded border px-2 py-0.5 text-ui-11 font-bold ${
                                  notedDays[row.dateLabel]
                                    ? 'border-red-500 bg-red-50 text-red-800 hover:bg-red-100'
                                    : 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100'
                                }`}
                              >
                                {notedDays[row.dateLabel] ? '註記' : '未註記'}
                              </button>
                              <button
                                type="button"
                                onClick={() => openSankeyQuarterDetail(row.dateLabel)}
                                className="rounded-md border border-blue-600 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100"
                              >
                                詳細資料
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
            ) : null}
            {sankeyExplorerView === 'quarter' && sankeyExplorerDay ? (
                <table className="w-full table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[7%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[9%]" />
                    <col className="w-[9%]" />
                    <col className="w-[10%]" />
                    <col className="w-[11%]" />
                    <col className="w-[11%]" />
                    <col className="w-[19%]" />
                  </colgroup>
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">時間</th>
                      <th className="px-3 py-2 text-right font-bold">發電端(量測)</th>
                      <th className="px-3 py-2 text-right font-bold">用電端(量測)</th>
                      <th className="px-3 py-2 text-right font-bold">儲能(+)</th>
                      <th className="px-3 py-2 text-right font-bold">儲能(-)</th>
                      <th className="px-3 py-2 text-right font-bold">儲能餘額(∑)</th>
                      <th className="px-3 py-2 text-right font-bold text-blue-700">合約匹配</th>
                      <th className="px-3 py-2 text-right font-bold text-blue-700">總匹配</th>
                      <th className="px-3 py-2 text-center font-bold">操作</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-900">
                    {explorerQuarterDisplayResolved.map((line) => {
                      const sk = `${sankeyExplorerDay}@${line.row.slotIndex}`;
                      const ovr = slotOverrides[sk] ?? {};
                      const base = explorerQuarterDisplay.find((l) => l.row.slotIndex === line.row.slotIndex);
                      const gen0 = base?.row.generationActual ?? line.row.generationActual;
                      const load0 = base?.row.loadActual ?? line.row.loadActual;
                      const storage0 = base?.row.storageActual ?? line.row.storageActual;
                      const gen = line.row.generationActual;
                      const load = line.row.loadActual;
                      const genAnom = Math.abs(gen - line.row.generationPlan) > Math.max(2, line.row.generationPlan * 0.08);
                      const loadAnom = Math.abs(load - line.row.loadPlan) > Math.max(2, line.row.loadPlan * 0.08);
                      const genCls = genAnom ? (slotVendorOk[sk] ? 'text-emerald-600' : 'text-rose-600') : '';
                      const loadCls = loadAnom ? (slotVendorOk[sk] ? 'text-emerald-600' : 'text-rose-600') : '';
                      const genEdited = ovr.generationActual != null && ovr.generationActual !== gen0;
                      const loadEdited = ovr.loadActual != null && ovr.loadActual !== load0;
                      const storageEdited = ovr.storageActual != null && ovr.storageActual !== storage0;
                      return (
                        <tr key={sk} className="border-t border-slate-200">
                          <td className="px-3 py-2 font-mono font-semibold">{line.row.timeLabel}</td>
                          <td className={`px-3 py-2 text-right tabular-nums ${genCls}`}>
                            {genEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{gen0.toFixed(3)}</span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'generation')}
                                >
                                  ({gen.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={gen0}
                                className={genCls}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'generation')}
                              />
                            )}
                          </td>
                          <td className={`px-3 py-2 text-right tabular-nums ${loadCls}`}>
                            {loadEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{load0.toFixed(3)}</span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'load')}
                                >
                                  ({load.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={load0}
                                className={loadCls}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'load')}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {storageEdited ? (
                              <>
                                <span className="text-slate-900 line-through">
                                  {Math.max(storage0, 0).toFixed(3)}
                                </span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'storageIn')}
                                >
                                  ({line.stIn.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={line.stIn}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'storageIn')}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {storageEdited ? (
                              <>
                                <span className="text-slate-900 line-through">
                                  {Math.max(-storage0, 0).toFixed(3)}
                                </span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'storageOut')}
                                >
                                  ({line.stOut.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={line.stOut}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'storageOut')}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <SankeyMetricButton
                              value={line.runBalance}
                              onClick={() => openSlotMetric(line.row.timeLabel, 'balance')}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-700">
                            <SankeyMetricButton
                              value={line.contractMatched}
                              className="text-blue-700"
                              onClick={() => openSlotMetric(line.row.timeLabel, 'contract')}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">
                            <SankeyMetricButton
                              value={line.totalMatched}
                              className="text-blue-700"
                              onClick={() => openSlotMetric(line.row.timeLabel, 'total')}
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              <button
                                type="button"
                                className={SANKEY_DETAIL_BTN}
                                onClick={() =>
                                  setEditTarget({
                                    slotKey: sk,
                                    timeLabel: line.row.timeLabel,
                                    generationOriginal: gen0,
                                    loadOriginal: load0,
                                    storageOriginal: storage0,
                                    draftGeneration: String(gen),
                                    draftLoad: String(load),
                                    draftStorage: String(line.row.storageActual),
                                    reason: ovr.reason ?? '',
                                  })
                                }
                              >
                                編輯
                              </button>
                              <button
                                type="button"
                                className={
                                  slotVendorOk[sk] ? SANKEY_VENDOR_CONFIRMED_BTN : SANKEY_VENDOR_BTN
                                }
                                onClick={() =>
                                  setSlotVendorOk((p) => ({
                                    ...p,
                                    [sk]: !p[sk],
                                  }))
                                }
                              >
                                {slotVendorOk[sk] ? '已確認' : '廠商確認'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
            ) : null}
            </div>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700">
            表格可捲動檢視。15 分鐘層級僅【編輯】可一次調整發電、用電、儲能量測並填寫一筆原因；異常數值以紅色標示，點【廠商確認】後改為綠色並顯示灰色【已確認】，再點一次可還原。
          </p>
          <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
            <DialogContent className="border-slate-200 bg-white text-slate-900 shadow-xl sm:max-w-md [&_[data-slot=dialog-close]]:text-slate-600">
              <DialogHeader>
                <DialogTitle className="text-slate-900">修改 15 分鐘量測值</DialogTitle>
                <DialogDescription className="text-slate-600">
                  {editTarget
                    ? `時段 ${editTarget.timeLabel}：可一次調整發電、用電與儲能量測，並填寫一筆修改原因（必填）。在數值欄按 Enter、或在原因欄按 Enter 皆可完成送出。`
                    : ''}
                </DialogDescription>
              </DialogHeader>
              {editTarget ? (
                <form
                  className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    commitSlotEdit();
                  }}
                >
                  <div>
                    <label className="text-xs font-bold text-slate-600">
                      發電端（量測，kWh）
                      <span className="ml-1 font-normal text-slate-500">
                        原始 {editTarget.generationOriginal.toFixed(3)}
                      </span>
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editTarget.draftGeneration}
                      onChange={(e) =>
                        setEditTarget((t) => (t ? { ...t, draftGeneration: e.target.value } : t))
                      }
                      className="mt-1 border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">
                      用電端（量測，kWh）
                      <span className="ml-1 font-normal text-slate-500">
                        原始 {editTarget.loadOriginal.toFixed(3)}
                      </span>
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editTarget.draftLoad}
                      onChange={(e) => setEditTarget((t) => (t ? { ...t, draftLoad: e.target.value } : t))}
                      className="mt-1 border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">
                      儲能（量測，kWh；正值存入、負值提領）
                      <span className="ml-1 font-normal text-slate-500">
                        原始 {editTarget.storageOriginal.toFixed(3)}
                      </span>
                    </label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editTarget.draftStorage}
                      onChange={(e) =>
                        setEditTarget((t) => (t ? { ...t, draftStorage: e.target.value } : t))
                      }
                      className="mt-1 border-slate-300 bg-white text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">
                      修改原因（追溯用）<span className="text-rose-600">*</span>
                    </label>
                    <textarea
                      required
                      className="mt-1 min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                      value={editTarget.reason}
                      onChange={(e) => setEditTarget((t) => (t ? { ...t, reason: e.target.value } : t))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          commitSlotEdit();
                        }
                      }}
                      placeholder="請說明本次調整原因…（Enter 送出、Shift+Enter 換行）"
                    />
                  </div>
                  <DialogFooter className="gap-2 border-t border-slate-200 pt-3 sm:justify-end">
                    <Button
                      type="button"
                      variant="outline"
                      className="border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                      onClick={() => setEditTarget(null)}
                    >
                      取消
                    </Button>
                    <Button type="submit" className="bg-indigo-600 text-white hover:bg-indigo-700">
                      完成
                    </Button>
                  </DialogFooter>
                </form>
              ) : null}
            </DialogContent>
          </Dialog>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">預結算分配量 / 轉移成功量</h3>
        <section className="mt-6 rounded-2xl border border-slate-300 bg-gradient-to-br from-slate-50 to-white p-4 shadow-sm">
          <h4 className="text-base font-bold text-slate-900">實際發電與實際用電｜失衡累積與匹配率 RE</h4>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            「多估計／少估計」為以 15 分鐘加總之實際發電與實際用電比較：實發高於實載列為多估計（盈餘電量），實載高於實發列為少估計（缺口電量）。RE
            ＝ 各時段轉移成功量加總 ÷ 用電量加總（預計 RE 僅用規劃量計算匹配、用電規劃加總為分母；實際 RE 用即時量測）。
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-amber-200 bg-white px-3 py-3">
              <p className="text-ui-11 font-bold text-amber-800">多估計（實發 &gt; 實載，累積 kWh）</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-900">{preSettlementReMetrics.surplusGenVsLoad.toFixed(1)}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white px-3 py-3">
              <p className="text-ui-11 font-bold text-rose-800">少估計（實載 &gt; 實發，累積 kWh）</p>
              <p className="mt-1 text-xl font-black tabular-nums text-rose-900">{preSettlementReMetrics.shortfallGenVsLoad.toFixed(1)}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-3">
              <p className="text-ui-11 font-bold text-indigo-800">預計 RE（僅規劃量）</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-indigo-900">{preSettlementReMetrics.rePlanPct.toFixed(2)}%</p>
              <p className="mt-1 text-ui-10 font-semibold text-slate-500">
                分子 {preSettlementReMetrics.sumTransferredPlan.toFixed(1)} ÷ 分母 {preSettlementReMetrics.totalLoadPlan.toFixed(1)} kWh
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white px-3 py-3">
              <p className="text-ui-11 font-bold text-emerald-800">實際 RE（即時量測）</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-900">{preSettlementReMetrics.reActualPct.toFixed(2)}%</p>
              <p className="mt-1 text-ui-10 font-semibold text-slate-500">
                分子 {preSettlementReMetrics.sumTransferredActual.toFixed(1)} ÷ 分母 {preSettlementReMetrics.totalLoadActual.toFixed(1)} kWh
              </p>
            </div>
          </div>
        </section>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">儲能預結算一致性（計畫量 vs 實際運轉）</h3>
        <p className="mt-1 text-xs font-semibold text-slate-800">
          計畫量對應申報計畫數值；比對實際運轉是否一致。展開後為 15 分鐘粒度（與預結算區塊同日資料）。
        </p>
        <button
          type="button"
          onClick={() => setShowStorageTable((v) => !v)}
          className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800"
        >
          {showStorageTable ? '收合詳細表格' : '展開詳細表格'}
        </button>
        {showStorageTable && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th className="px-3 py-2 text-left font-bold">時間</th>
                <th className="px-3 py-2 text-right font-bold">計畫量(kWh)</th>
                <th className="px-3 py-2 text-right font-bold">實際運轉(kWh)</th>
                <th className="px-3 py-2 text-right font-bold">差異(kWh)</th>
                <th className="px-3 py-2 text-center font-bold">一致性</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              {storageSettlementQuarterRows.map((r) => (
                <tr key={`storage-settlement-${r.timeLabel}`} className="border-t border-slate-200">
                  <td className="px-3 py-2 font-mono text-xs">{r.timeLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.plan.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.actual.toFixed(3)}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${r.delta === 0 ? 'text-slate-700' : r.delta > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r.delta.toFixed(3)}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${r.consistent ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                      {r.consistent ? '一致' : '需調整'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>}
      </section>
      <SankeyDetailDialog focus={detailFocus} onClose={() => setDetailFocus(null)} />
      {saveToast ? (
        <div className="fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-xl">
          修改成功
        </div>
      ) : null}
    </div>
  );
}
