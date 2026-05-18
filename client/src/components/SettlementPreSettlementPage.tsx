import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useEffect, useMemo, useState } from 'react';

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
} from '@/components/SettlementEnergyFlowSankey';

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
  const chartDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const hourlyRows = useMemo(() => buildHourlyRowsByDate(chartDateLabel), [chartDateLabel]);
  const now = useMemo(() => new Date(), []);
  const [sankeyExplorerYear, setSankeyExplorerYear] = useState(() => new Date().getFullYear());
  const [sankeyExplorerView, setSankeyExplorerView] = useState<'year' | 'daily' | 'quarter'>('year');
  const [sankeyExplorerMonth, setSankeyExplorerMonth] = useState<number | null>(null);
  const [sankeyExplorerDay, setSankeyExplorerDay] = useState<string | null>(null);
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

  const sankeyDetailRows = useMemo(() => {
    const totalDays = 25;
    const baseDate = new Date();
    baseDate.setHours(12, 0, 0, 0);

    // 先由舊到新計算，讓儲能存入可以累積到隔天餘額
    const ascRows: Array<{
      dateLabel: string;
      generation: number;
      load: number;
      storageIn: number;
      storageBalance: number;
      storageOut: number;
      contractMatched: number;
      totalMatched: number;
    }> = [];

    let carryBalance = 6;
    const dayRefs = Array.from({ length: totalDays }, (_, idx) => {
      const ref = new Date(baseDate);
      ref.setDate(baseDate.getDate() - (totalDays - 1 - idx));
      return ref;
    });

    dayRefs.forEach((ref) => {
      const dateLabel = ref.toISOString().slice(0, 10);
      const dayRows = buildHourlyRowsByDate(dateLabel);
      const generation = Number(dayRows.reduce((sum, row) => sum + row.generationActual, 0).toFixed(1));
      const load = Number(dayRows.reduce((sum, row) => sum + row.loadActual, 0).toFixed(1));

      // 發電端超過用電端時，優先提高儲能存入
      const surplus = Math.max(generation - load, 0);
      const storageIn = Number((surplus * 0.62).toFixed(1));

      // 當日可動用餘額 = 前日結餘 + 今日存入
      const availableBalance = Number((carryBalance + storageIn).toFixed(1));

      // 提領量受當日餘額上限限制
      const deficit = Math.max(load - generation, 0);
      const desiredOut = deficit * 0.5;
      const storageOut = Number(Math.min(availableBalance, desiredOut).toFixed(1));

      const endBalance = Number((availableBalance - storageOut).toFixed(1));
      carryBalance = endBalance;

      const contractMatched = Number(Math.min(generation, load * 0.35).toFixed(1));
      const totalMatched = Number((storageOut + contractMatched).toFixed(1));

      ascRows.push({
        dateLabel,
        generation,
        load,
        storageIn,
        storageBalance: endBalance,
        storageOut,
        contractMatched,
        totalMatched,
      });
    });

    // UI 維持由新到舊顯示
    return ascRows.reverse();
  }, []);

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

  const sankeyDailyRowsForExplorer = useMemo(() => {
    if (sankeyExplorerView !== 'daily' || sankeyExplorerMonth == null) return [];
    return (sankeyDetailRows as SankeyDetailDayRow[])
      .filter((r) => {
        const [y, mm] = r.dateLabel.slice(0, 10).split('-').map(Number);
        return y === sankeyExplorerYear && mm === sankeyExplorerMonth;
      })
      .sort((a, b) => b.dateLabel.localeCompare(a.dateLabel));
  }, [sankeyDetailRows, sankeyExplorerMonth, sankeyExplorerView, sankeyExplorerYear]);

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
    const hourly = buildHourlyRowsByDate(sankeyExplorerDay);
    return expandHourlyToQuarterRows(hourly, sankeyExplorerDay);
  }, [sankeyExplorerDay]);

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

  const [styleMode, setStyleMode] = useState<SankeyStyleMode>(defaultStyleMode);
  const [granularity, setGranularity] = useState<SankeyGranularity>('summary4h');
  const [sankeyFlowView, setSankeyFlowView] = useState<SankeyFlowView>('main');
  const [showGeneratorMeterId, setShowGeneratorMeterId] = useState(true);
  const [showLoadMeterId, setShowLoadMeterId] = useState(true);
  const [cExpanded, setCExpanded] = useState(false);
  const [enlargeSankey, setEnlargeSankey] = useState(false);
  const [showSankeyTable, setShowSankeyTable] = useState(false);
  const [showStorageTable, setShowStorageTable] = useState(false);
  const [notedDays, setNotedDays] = useState<Record<string, boolean>>({});
  const [slotOverrides, setSlotOverrides] = useState<
    Record<string, { generationActual?: number; loadActual?: number; reason?: string }>
  >({});
  const [slotVendorOk, setSlotVendorOk] = useState<Record<string, boolean>>({});
  const [editTarget, setEditTarget] = useState<{
    slotKey: string;
    field: 'generationActual' | 'loadActual';
    label: string;
    original: number;
    currentShown: number;
    draft: string;
    reason: string;
  } | null>(null);
  const [saveToast, setSaveToast] = useState(false);
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
          label: { position: 'left' as const },
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
        { name: storageAccount, itemStyle: { color: '#7c3aed' }, label: { position: 'left' as const } },
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
      ...leftNodes.map((name) => ({ name, itemStyle: { color: '#f59e0b' }, label: { position: 'left' as const } })),
      { name: leftPrevDayStorage, itemStyle: { color: '#0f766e' }, label: { position: 'left' as const } },
      { name: middleContract, itemStyle: { color: '#4f46e5' }, label: { position: 'inside' as const } },
      { name: middleStorage, itemStyle: { color: '#7c3aed' }, label: { position: 'inside' as const } },
      { name: middleStorageBalance, itemStyle: { color: '#5b21b6' }, label: { position: 'inside' as const } },
      { name: middleSurplus, itemStyle: { color: '#a16207' }, label: { position: 'inside' as const } },
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
          left: 6,
          right: 170,
          top: 8,
          bottom: 8,
          emphasis: { focus: 'adjacency' },
          nodeWidth: 12,
          nodeGap: 7,
          draggable: true,
          lineStyle: { color: 'source', curveness: 0.45, opacity: 0.6 },
          label: { color: '#0f172a', fontSize: 11, fontWeight: 600, overflow: 'breakAll' },
          data: sankeyModel.nodes,
          links: sankeyModel.links,
        },
      ],
    }),
    [sankeyModel]
  );

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      {pageHeading.startsWith('4.1') ? (
        <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">RE 年度目標與累計達成率</h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            自訂統計區間後，以區間內累計成功匹配量與累計用電量計算 RE；年度目標可自行輸入（%）作為對照。
          </p>
          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-slate-500">RE 年度目標</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-indigo-800">{reAnnualTargetPct.toFixed(1)}%</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-slate-500">累計成功匹配量（kWh）</p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{cumulativeReForRange.sumMatched.toFixed(1)}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">區間內 {cumulativeReForRange.dayCount} 日加總</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-slate-500">累計用電量（kWh）</p>
                <p className="mt-1 text-xl font-black tabular-nums text-slate-900">{cumulativeReForRange.sumLoad.toFixed(1)}</p>
                <p className="mt-0.5 text-[10px] font-semibold text-slate-500">區間內 {cumulativeReForRange.dayCount} 日加總</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 px-3 py-3 shadow-sm">
                <p className="text-[11px] font-bold text-emerald-900">
                  <span className="cursor-help border-b border-dotted border-emerald-700" title={reAchievementTooltip}>
                    RE 累計達成率
                  </span>
                </p>
                <p className="mt-1 text-2xl font-black tabular-nums text-emerald-800">{cumulativeReForRange.rePct.toFixed(2)}%</p>
                <p className={`mt-1 text-xs font-bold ${reVsTargetDiff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                  與年度目標差 {reVsTargetDiff >= 0 ? '+' : ''}
                  {reVsTargetDiff.toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="w-full shrink-0 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm lg:w-[300px]">
              <p className="mb-3 text-xs font-black text-slate-800">區間與目標設定</p>
              <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-600">起日</label>
              <input
                type="date"
                value={reCumStart || reDataDateSpan.start}
                min={reDataDateSpan.start || undefined}
                max={reDataDateSpan.end || undefined}
                onChange={(e) => setReCumStart(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
              />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold text-slate-600">迄日</label>
              <input
                type="date"
                value={reCumEnd || reDataDateSpan.end}
                min={reDataDateSpan.start || undefined}
                max={reDataDateSpan.end || undefined}
                onChange={(e) => setReCumEnd(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
              />
                </div>
                <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-600">RE 年度目標（%）</label>
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
            <button
              type="button"
              onClick={() => {
                setReCumStart(reDataDateSpan.start);
                setReCumEnd(reDataDateSpan.end);
              }}
              className="h-9 w-full rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
            >
              帶入資料全日區間
            </button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
              <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
                資料來源：AMI(量測)
              </span>
              <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
                資料來源：M表(量測)
              </span>
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                資料來源：計畫量
              </span>
              </div>
            </div>
          </div>
          <SettlementEnergyFlowSankey drill={energyFlowDrill} aggregate={energyFlowAggregate} embedded />
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
            分鐘可編輯量測值並填寫原因；異常以紅色標示，廠商確認後改為綠色。
          </p>
          <div className="mb-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-600">資料年度</label>
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
              <span className="w-full text-[10px] font-bold text-slate-600">月份（已結算可點）</span>
              <div className="flex w-full flex-wrap gap-1.5">
                {sankeyMonthlyRowsForYear.map(({ month, label, selectable }) => (
                  <button
                    key={month}
                    type="button"
                    disabled={!selectable}
                    onClick={() => {
                      if (!selectable) return;
                      setSankeyExplorerMonth(month);
                      setSankeyExplorerView('daily');
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
          </div>
          <div className="max-h-[620px] overflow-auto rounded-lg border border-slate-200">
            {sankeyExplorerView === 'year' ? (
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                  <tr>
                    <th className="px-3 py-2 text-left font-bold">時間</th>
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
                  {sankeyMonthlyRowsForYear.map(({ month, label, selectable, row }) => {
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
                        <td className="px-3 py-2 text-right tabular-nums">{z.generation.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{z.load.toFixed(1)}</td>
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
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{z.storageBalance.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-700">{z.contractMatched.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{z.totalMatched.toFixed(1)}</td>
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
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSankeyExplorerView('year');
                      setSankeyExplorerMonth(null);
                      setSankeyExplorerDay(null);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
                  >
                    返回年度
                  </button>
                  <span className="text-xs font-bold text-slate-600">
                    {sankeyExplorerYear} 年 {MONTH_NAMES_TW[sankeyExplorerMonth - 1]} · 日明細
                  </span>
                </div>
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
                      <th className="px-3 py-2 text-center font-bold">註記</th>
                      <th className="px-3 py-2 text-center font-bold">取消註記</th>
                      <th className="px-3 py-2 text-center font-bold">詳細資料</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sankeyDailyRowsForExplorer.length === 0 ? (
                      <tr>
                        <td colSpan={11} className="px-3 py-6 text-center text-sm font-semibold text-slate-500">
                          本月示範資料尚無列；可換選有資料的月份或調整年度。
                        </td>
                      </tr>
                    ) : (
                      sankeyDailyRowsForExplorer.map((row) => (
                        <tr key={row.dateLabel} className="border-t border-slate-200 text-slate-900">
                          <td className="px-3 py-2 font-semibold text-blue-800">{row.dateLabel}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.generation.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.load.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.storageIn.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.storageOut.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.storageBalance.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{row.contractMatched.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{row.totalMatched.toFixed(1)}</td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              disabled={!!notedDays[row.dateLabel]}
                              onClick={() => setNotedDays((p) => ({ ...p, [row.dateLabel]: true }))}
                              className="rounded border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-900 disabled:opacity-40"
                            >
                              註記
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              disabled={!notedDays[row.dateLabel]}
                              onClick={() =>
                                setNotedDays((p) => {
                                  const n = { ...p };
                                  delete n[row.dateLabel];
                                  return n;
                                })
                              }
                              className="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-bold text-slate-700 disabled:opacity-40"
                            >
                              取消註記
                            </button>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setSankeyExplorerView('quarter');
                                setSankeyExplorerDay(row.dateLabel);
                              }}
                              className="rounded-md border border-blue-600 bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800 hover:bg-blue-100"
                            >
                              詳細資料
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </>
            ) : null}
            {sankeyExplorerView === 'quarter' && sankeyExplorerDay ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSankeyExplorerView('daily');
                      setSankeyExplorerDay(null);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
                  >
                    返回每日
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSankeyExplorerView('year');
                      setSankeyExplorerMonth(null);
                      setSankeyExplorerDay(null);
                    }}
                    className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-800 hover:bg-slate-50"
                  >
                    返回年度
                  </button>
                  <span className="text-xs font-bold text-slate-600">15 分鐘 · {sankeyExplorerDay}</span>
                </div>
                <table className="min-w-[1080px] text-xs">
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold">時間</th>
                      <th className="px-2 py-2 text-right font-bold">發電端(量測)</th>
                      <th className="px-2 py-2 text-right font-bold">用電端(量測)</th>
                      <th className="px-2 py-2 text-right font-bold">儲能(+)</th>
                      <th className="px-2 py-2 text-right font-bold">儲能(-)</th>
                      <th className="px-2 py-2 text-right font-bold">儲能餘額(∑)</th>
                      <th className="px-2 py-2 text-right font-bold text-blue-700">合約匹配</th>
                      <th className="px-2 py-2 text-right font-bold text-blue-700">總匹配</th>
                      <th className="px-2 py-2 text-center font-bold">操作</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-900">
                    {explorerQuarterDisplay.map((line) => {
                      const sk = `${sankeyExplorerDay}@${line.row.slotIndex}`;
                      const ovr = slotOverrides[sk] ?? {};
                      const gen0 = line.row.generationActual;
                      const load0 = line.row.loadActual;
                      const gen = ovr.generationActual ?? gen0;
                      const load = ovr.loadActual ?? load0;
                      const genAnom = Math.abs(gen - line.row.generationPlan) > Math.max(2, line.row.generationPlan * 0.08);
                      const loadAnom = Math.abs(load - line.row.loadPlan) > Math.max(2, line.row.loadPlan * 0.08);
                      const genCls = genAnom ? (slotVendorOk[sk] ? 'text-emerald-600' : 'text-rose-600') : '';
                      const loadCls = loadAnom ? (slotVendorOk[sk] ? 'text-emerald-600' : 'text-rose-600') : '';
                      const genEdited = ovr.generationActual != null && ovr.generationActual !== gen0;
                      const loadEdited = ovr.loadActual != null && ovr.loadActual !== load0;
                      return (
                        <tr key={sk} className="border-t border-slate-200">
                          <td className="px-2 py-1.5 font-mono font-semibold">{line.row.timeLabel}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${genCls}`}>
                            {genEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{gen0.toFixed(3)}</span>{' '}
                                <span className="font-semibold text-emerald-600">({gen.toFixed(3)})</span>
                              </>
                            ) : (
                              gen0.toFixed(3)
                            )}
                          </td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${loadCls}`}>
                            {loadEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{load0.toFixed(3)}</span>{' '}
                                <span className="font-semibold text-emerald-600">({load.toFixed(3)})</span>
                              </>
                            ) : (
                              load0.toFixed(3)
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{line.stIn.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{line.stOut.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums font-semibold">{line.runBalance.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-blue-700">{line.contractMatched.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold text-blue-700">{line.totalMatched.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-center whitespace-nowrap">
                            <button
                              type="button"
                              className="mr-1 text-[11px] font-bold text-blue-700 underline"
                              onClick={() =>
                                setEditTarget({
                                  slotKey: sk,
                                  field: 'generationActual',
                                  label: '發電端（量測，kWh）',
                                  original: gen0,
                                  currentShown: gen,
                                  draft: String(gen),
                                  reason: ovr.reason ?? '',
                                })
                              }
                            >
                              編輯
                            </button>
                            <button
                              type="button"
                              className="mr-1 text-[11px] font-bold text-blue-700 underline"
                              onClick={() =>
                                setEditTarget({
                                  slotKey: sk,
                                  field: 'loadActual',
                                  label: '用電端（量測，kWh）',
                                  original: load0,
                                  currentShown: load,
                                  draft: String(load),
                                  reason: ovr.reason ?? '',
                                })
                              }
                            >
                              用電
                            </button>
                            <button
                              type="button"
                              className="text-[11px] font-bold text-emerald-800 underline"
                              onClick={() =>
                                setSlotVendorOk((p) => ({
                                  ...p,
                                  [sk]: !p[sk],
                                }))
                              }
                            >
                              {slotVendorOk[sk] ? '取消確認' : '廠商確認'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            ) : null}
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700">
            表格可捲動檢視。15 分鐘層級可編輯量測值並填寫原因；完成後顯示「修改成功」約 0.8 秒。異常數值以紅色標示，廠商確認後改為綠色。
          </p>
          <Dialog open={editTarget !== null} onOpenChange={(o) => !o && setEditTarget(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>修改數值</DialogTitle>
                <DialogDescription>
                  {editTarget
                    ? `欄位：${editTarget.label}；目前顯示：${editTarget.currentShown.toFixed(3)} kWh（原始 ${editTarget.original.toFixed(3)}）`
                    : ''}
                </DialogDescription>
              </DialogHeader>
              {editTarget ? (
                <div className="grid gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600">修改為（kWh）</label>
                    <Input
                      type="number"
                      step="0.001"
                      value={editTarget.draft}
                      onChange={(e) => setEditTarget((t) => (t ? { ...t, draft: e.target.value } : t))}
                      className="mt-1 border-slate-300"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600">原因（追溯用）</label>
                    <textarea
                      className="mt-1 min-h-[72px] w-full rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-900"
                      value={editTarget.reason}
                      onChange={(e) => setEditTarget((t) => (t ? { ...t, reason: e.target.value } : t))}
                    />
                  </div>
                </div>
              ) : null}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                  取消
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    if (!editTarget) return;
                    const v = Number(editTarget.draft);
                    if (!Number.isFinite(v)) return;
                    setSlotOverrides((prev) => ({
                      ...prev,
                      [editTarget.slotKey]: {
                        ...prev[editTarget.slotKey],
                        [editTarget.field]: v,
                        reason: editTarget.reason,
                      },
                    }));
                    setEditTarget(null);
                    setSaveToast(true);
                  }}
                >
                  完成
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div id="sankey-mode-anchor" className="mb-4 flex scroll-mt-4 flex-wrap items-center gap-2">
          <span className="text-xs font-black text-slate-700">桑基呈現模式：</span>
          <button
            type="button"
            onClick={() => setStyleMode('ab')}
            className={`rounded-full px-3 py-1 text-xs font-bold ${styleMode === 'ab' ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
          >
            樣式A+B（推薦）
          </button>
          <button
            type="button"
            onClick={() => setStyleMode('c')}
            className={`rounded-full px-3 py-1 text-xs font-bold ${styleMode === 'c' ? 'bg-indigo-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
          >
            樣式C（互動展開）
          </button>
          {styleMode === 'ab' && (
            <>
              <button
                type="button"
                onClick={() => setGranularity('summary4h')}
                className={`rounded-full px-3 py-1 text-xs font-bold ${granularity === 'summary4h' ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
              >
                摘要（每4小時）
              </button>
              <button
                type="button"
                onClick={() => setGranularity('detail24h')}
                className={`rounded-full px-3 py-1 text-xs font-bold ${granularity === 'detail24h' ? 'bg-slate-800 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
              >
                詳細（24時段）
              </button>
            </>
          )}
          {styleMode === 'c' && (
            <span className="text-xs font-semibold text-slate-700">
              先看摘要，點「儲能調節帳戶」可切換 24 時段展開。
            </span>
          )}
          <button
            type="button"
            onClick={() => setEnlargeSankey((v) => !v)}
            className="ml-auto rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700"
          >
            {enlargeSankey ? '縮小圖表' : '放大圖表'}
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSankeyFlowView('main')}
            className={`rounded-full px-3 py-1 text-xs font-bold ${sankeyFlowView === 'main' ? 'bg-slate-900 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
          >
            總匹配視角
          </button>
          <button
            type="button"
            onClick={() => setSankeyFlowView('charge')}
            className={`rounded-full px-3 py-1 text-xs font-bold ${sankeyFlowView === 'charge' ? 'bg-indigo-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
          >
            儲能存入（10:00-14:00）
          </button>
          <button
            type="button"
            onClick={() => setSankeyFlowView('discharge')}
            className={`rounded-full px-3 py-1 text-xs font-bold ${sankeyFlowView === 'discharge' ? 'bg-violet-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
          >
            儲能提領（16:00-20:00）
          </button>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={showGeneratorMeterId}
              onChange={(e) => setShowGeneratorMeterId(e.target.checked)}
            />
            顯示發電電號
          </label>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <input
              type="checkbox"
              checked={showLoadMeterId}
              onChange={(e) => setShowLoadMeterId(e.target.checked)}
            />
            顯示用電電號
          </label>
        </div>
        <p className="mt-1 text-xs font-semibold text-slate-800">以單日加總量，呈現發電端 → ECVN合約與調節帳戶 → 合約用戶/儲能時段/儲能餘額/餘電。</p>
        <p id="sankey-date-anchor" className="mt-2 text-center text-sm font-bold text-slate-900">{sankeyDisplayDateText}</p>
        <div id="sankey-match-chart" className={`mt-4 ${enlargeSankey ? 'h-[560px]' : 'h-[360px]'} rounded-xl border border-slate-200 bg-slate-50 p-2`}>
          <ReactECharts
            option={sankeyOption}
            style={{ height: '100%', width: '100%' }}
            onEvents={{
              click: (params: { name?: string; dataType?: string; data?: { name?: string } }) => {
                const nodeName = params.dataType === 'node' ? (params.data?.name ?? params.name) : params.data?.name ?? params.name;
                if (styleMode === 'c' && nodeName === 'ECVN合約與調節帳戶｜儲能調節帳戶') {
                  setCExpanded((v) => !v);
                }
              },
            }}
          />
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-800">
          合約履行只流向「合約用戶（匹配成功）」；24 時段節點為「儲能時段價值」，由「儲能調節帳戶」流入。
        </p>
        <button
          type="button"
          onClick={() => setShowSankeyTable((v) => !v)}
          className="mt-3 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800"
        >
          {showSankeyTable ? '收合詳細表格' : '展開詳細表格'}
        </button>
        {showSankeyTable && <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-100 text-slate-900">
              <tr>
                <th className="px-3 py-2 text-left font-bold">中間帳戶</th>
                <th className="px-3 py-2 text-right font-bold">加總量(kWh)</th>
                <th className="px-3 py-2 text-left font-bold">說明</th>
              </tr>
            </thead>
            <tbody className="text-slate-900">
              <tr className="border-t border-slate-200">
                <td className="px-3 py-2">合約履行</td>
                <td className="px-3 py-2 text-right tabular-nums">{sankeyModel.summary.totalContract.toFixed(1)}</td>
                <td className="px-3 py-2">對應右側第一筆「合約用戶（匹配成功）」</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-3 py-2">儲能調節帳戶</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  <button
                    type="button"
                    className="font-semibold text-indigo-700 underline-offset-2 hover:underline"
                    onClick={() => setSankeyFlowView('charge')}
                  >
                    {sankeyModel.summary.totalStorageFlow.toFixed(1)}
                  </button>
                </td>
                <td className="px-3 py-2">流向 24 時段用戶端與儲能餘額</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-3 py-2">前一天儲能餘額</td>
                <td className="px-3 py-2 text-right tabular-nums">{previousDayStorageBalance.toFixed(1)}</td>
                <td className="px-3 py-2">左下來源，直接流入「儲能調節帳戶」供 16:00-20:00 提領使用</td>
              </tr>
              <tr className="border-t border-slate-200">
                <td className="px-3 py-2">未履約餘電</td>
                <td className="px-3 py-2 text-right tabular-nums">{sankeyModel.summary.totalUnfulfilled.toFixed(1)}</td>
                <td className="px-3 py-2">流向右側最後一筆「餘電」</td>
              </tr>
            </tbody>
          </table>
        </div>}

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
              <p className="text-[11px] font-bold text-amber-800">多估計（實發 &gt; 實載，累積 kWh）</p>
              <p className="mt-1 text-xl font-black tabular-nums text-amber-900">{preSettlementReMetrics.surplusGenVsLoad.toFixed(1)}</p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-white px-3 py-3">
              <p className="text-[11px] font-bold text-rose-800">少估計（實載 &gt; 實發，累積 kWh）</p>
              <p className="mt-1 text-xl font-black tabular-nums text-rose-900">{preSettlementReMetrics.shortfallGenVsLoad.toFixed(1)}</p>
            </div>
            <div className="rounded-xl border border-indigo-200 bg-white px-3 py-3">
              <p className="text-[11px] font-bold text-indigo-800">預計 RE（僅規劃量）</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-indigo-900">{preSettlementReMetrics.rePlanPct.toFixed(2)}%</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
                分子 {preSettlementReMetrics.sumTransferredPlan.toFixed(1)} ÷ 分母 {preSettlementReMetrics.totalLoadPlan.toFixed(1)} kWh
              </p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-white px-3 py-3">
              <p className="text-[11px] font-bold text-emerald-800">實際 RE（即時量測）</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-emerald-900">{preSettlementReMetrics.reActualPct.toFixed(2)}%</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">
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
      {saveToast ? (
        <div className="fixed bottom-8 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white shadow-xl">
          修改成功
        </div>
      ) : null}
    </div>
  );
}
