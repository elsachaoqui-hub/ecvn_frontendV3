import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

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

function buildSeriesChartOption(title: string, rows: HourRow[], planKey: keyof HourRow, actualKey: keyof HourRow, unit: string): EChartsOption {
  return {
    animation: false,
    title: { text: title, left: 8, top: 4, textStyle: { fontSize: 13, fontWeight: 700, color: '#0f172a' } },
    grid: { top: 34, right: 18, bottom: 46, left: 52, containLabel: true },
    tooltip: { trigger: 'axis' },
    legend: { top: 8, right: 10, textStyle: { fontSize: 11, color: '#0f172a', fontWeight: 700 } },
    xAxis: {
      type: 'category',
      data: rows.map((r) => `${String(r.hour).padStart(2, '0')}:00`),
      axisLabel: { fontSize: 10, interval: 3, color: '#0f172a', fontWeight: 600 },
      axisLine: { lineStyle: { color: '#334155', width: 1.3 } },
    },
    yAxis: {
      type: 'value',
      name: unit,
      nameTextStyle: { color: '#0f172a', fontWeight: 700 },
      axisLabel: { fontSize: 10, color: '#0f172a', fontWeight: 600 },
      axisLine: { show: true, lineStyle: { color: '#334155', width: 1.3 } },
      splitLine: { lineStyle: { color: '#94a3b8', width: 1, opacity: 0.65 } },
    },
    series: [
      {
        name: '規劃量',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { type: 'dashed', width: 2, color: '#334155' },
        itemStyle: { color: '#334155' },
        data: rows.map((r) => Number(r[planKey])),
      },
      {
        name: '即時量測',
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2.4, color: '#2563eb' },
        itemStyle: { color: '#2563eb' },
        data: rows.map((r) => Number(r[actualKey])),
      },
    ],
  };
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

export default function SettlementPreSettlementPage({
  pageHeading = '4.1 預結算 - 桑基匹配圖',
  defaultStyleMode = 'ab',
}: SettlementPreSettlementPageProps) {
  const chartDateLabel = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const hourlyRows = useMemo(() => buildHourlyRowsByDate(chartDateLabel), [chartDateLabel]);
  const now = useMemo(() => new Date(), []);
  const [sankeyDatePreset, setSankeyDatePreset] = useState<'7d' | '30d' | 'all'>('7d');
  const [sankeyDateStart, setSankeyDateStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [sankeyDateEnd, setSankeyDateEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedSankeyDate, setSelectedSankeyDate] = useState(() => new Date().toISOString().slice(0, 10));

  const quarterRows = useMemo(() => expandHourlyToQuarterRows(hourlyRows, chartDateLabel), [hourlyRows, chartDateLabel]);

  const allocationQuarterRows = useMemo(
    () =>
      quarterRows.map((row) => {
        const allocated = Math.min(row.generationActual + Math.max(row.storageActual, 0), row.loadPlan);
        const transferred = Math.max(0, Math.min(allocated, row.loadActual));
        return {
          timeLabel: row.timeLabel,
          allocated: Number(allocated.toFixed(3)),
          transferred: Number(transferred.toFixed(3)),
          diff: Number((transferred - row.loadActual).toFixed(3)),
        };
      }),
    [quarterRows]
  );

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

  const filteredSankeyDetailRows = useMemo(() => {
    if (sankeyDatePreset === 'all') return sankeyDetailRows;
    const end = new Date(`${sankeyDateEnd}T23:59:59`);
    const start = new Date(`${sankeyDateStart}T00:00:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return sankeyDetailRows;
    return sankeyDetailRows.filter((row) => {
      const rowDate = new Date(`${row.dateLabel.slice(0, 10)}T12:00:00`);
      return rowDate.getTime() >= start.getTime() && rowDate.getTime() <= end.getTime();
    });
  }, [sankeyDateEnd, sankeyDatePreset, sankeyDateStart, sankeyDetailRows]);

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
  const [showAllocationTable, setShowAllocationTable] = useState(false);
  const [showStorageTable, setShowStorageTable] = useState(false);
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

  const genChartOption = useMemo(
    () => buildSeriesChartOption('發電量：規劃 vs 即時', hourlyRows, 'generationPlan', 'generationActual', 'kWh'),
    [hourlyRows]
  );
  const loadChartOption = useMemo(
    () => buildSeriesChartOption('用電量：規劃 vs 即時', hourlyRows, 'loadPlan', 'loadActual', 'kWh'),
    [hourlyRows]
  );
  const storageChartOption = useMemo(
    () => buildSeriesChartOption('儲能量：規劃 vs 即時', hourlyRows, 'storagePlan', 'storageActual', 'kWh'),
    [hourlyRows]
  );

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      {pageHeading.startsWith('4.1') ? (
        <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-sm">
          <h3 className="text-base font-bold text-slate-900">RE 年度目標與累計達成率</h3>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            自訂統計區間後，以區間內累計成功匹配量與累計用電量計算 RE；年度目標可自行輸入（%）作為對照。
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white/90 p-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold text-slate-600">起日</label>
              <input
                type="date"
                value={reCumStart || reDataDateSpan.start}
                min={reDataDateSpan.start || undefined}
                max={reDataDateSpan.end || undefined}
                onChange={(e) => setReCumStart(e.target.value)}
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
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
                className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
              />
            </div>
            <div className="min-w-[7rem]">
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
              className="h-9 rounded-md border border-slate-300 bg-slate-50 px-3 text-xs font-bold text-slate-700"
            >
              帶入資料全日區間
            </button>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
                <span
                  className="cursor-help border-b border-dotted border-emerald-700"
                  title={reAchievementTooltip}
                >
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
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">資料來源：AMI(量測)</span>
          <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">資料來源：M表(量測)</span>
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">資料來源：計畫量</span>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900">{pageHeading}</h3>
        <div className="mb-5 mt-4 rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
          <p className="mb-3 text-sm font-black text-slate-900">桑基匹配明細表（可點日期跳回桑基圖）</p>
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <span className="mr-1 text-xs font-black text-slate-700">日期篩選：</span>
            <button
              type="button"
              onClick={() => {
                const end = new Date(now);
                const start = new Date(now);
                start.setDate(end.getDate() - 6);
                setSankeyDatePreset('7d');
                setSankeyDateStart(start.toISOString().slice(0, 10));
                setSankeyDateEnd(end.toISOString().slice(0, 10));
              }}
              className={`rounded-full px-3 py-1 text-xs font-bold ${sankeyDatePreset === '7d' ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              近7天（預設）
            </button>
            <button
              type="button"
              onClick={() => {
                const end = new Date(now);
                const start = new Date(now);
                start.setDate(end.getDate() - 29);
                setSankeyDatePreset('30d');
                setSankeyDateStart(start.toISOString().slice(0, 10));
                setSankeyDateEnd(end.toISOString().slice(0, 10));
              }}
              className={`rounded-full px-3 py-1 text-xs font-bold ${sankeyDatePreset === '30d' ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              近30天
            </button>
            <button
              type="button"
              onClick={() => setSankeyDatePreset('all')}
              className={`rounded-full px-3 py-1 text-xs font-bold ${sankeyDatePreset === 'all' ? 'bg-blue-700 text-white' : 'border border-slate-300 bg-white text-slate-700'}`}
            >
              全部
            </button>
            <div className="ml-auto flex items-end gap-2">
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-600">起日</label>
                <input
                  type="date"
                  value={sankeyDateStart}
                  onChange={(e) => {
                    setSankeyDatePreset('7d');
                    setSankeyDateStart(e.target.value);
                  }}
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold text-slate-600">迄日</label>
                <input
                  type="date"
                  value={sankeyDateEnd}
                  onChange={(e) => {
                    setSankeyDatePreset('7d');
                    setSankeyDateEnd(e.target.value);
                  }}
                  className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800"
                />
              </div>
            </div>
          </div>
          <div className="max-h-[570px] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left font-bold">日期</th>
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
                  <th className="px-3 py-2 text-right font-bold text-blue-700">總匹配量(儲能提領+合約匹配量)</th>
                </tr>
              </thead>
              <tbody className="text-slate-900">
                {filteredSankeyDetailRows.map((row, idx) => (
                  <tr key={`sankey-detail-${idx}`} className="border-t border-slate-200">
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-semibold text-blue-700 underline-offset-2 hover:underline"
                        onClick={() => {
                          setSelectedSankeyDate(row.dateLabel);
                          const anchor = document.getElementById('sankey-mode-anchor');
                          if (anchor) {
                            const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                          }
                        }}
                      >
                        {row.dateLabel}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.generation.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.load.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <button
                        type="button"
                        className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => {
                          setSelectedSankeyDate(row.dateLabel);
                          setSankeyFlowView('charge');
                          const anchor = document.getElementById('sankey-mode-anchor');
                          if (anchor) {
                            const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                          }
                        }}
                      >
                        {row.storageIn.toFixed(1)}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <button
                        type="button"
                        className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => {
                          setSelectedSankeyDate(row.dateLabel);
                          setSankeyFlowView('discharge');
                          const anchor = document.getElementById('sankey-mode-anchor');
                          if (anchor) {
                            const y = anchor.getBoundingClientRect().top + window.scrollY - 16;
                            window.scrollTo({ top: y, behavior: 'smooth' });
                          }
                        }}
                      >
                        {row.storageOut.toFixed(1)}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-900">
                      {row.storageBalance.toFixed(1)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-blue-700">{row.contractMatched.toFixed(1)}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{row.totalMatched.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-700">一次視窗最多呈現約 15 行，其餘可透過表格內捲動檢視。</p>
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
        <p className="mt-1 text-xs font-semibold text-slate-600">
          下列明細以當日示範資料為準，時間粒度為每 15 分鐘一筆（00:00、00:15…共 96 筆）；與上方三圖同日、同套假資料邏輯。
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-[260px] rounded-xl border border-slate-200 bg-slate-50 p-2"><ReactECharts option={genChartOption} style={{ height: '100%' }} /></div>
          <div className="h-[260px] rounded-xl border border-slate-200 bg-slate-50 p-2"><ReactECharts option={loadChartOption} style={{ height: '100%' }} /></div>
          <div className="h-[260px] rounded-xl border border-slate-200 bg-slate-50 p-2"><ReactECharts option={storageChartOption} style={{ height: '100%' }} /></div>
        </div>
        <button
          type="button"
          onClick={() => setShowAllocationTable((v) => !v)}
          className="mt-4 rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-800"
        >
          {showAllocationTable ? '收合詳細表格' : '展開詳細表格'}
        </button>
        {showAllocationTable && (
          <div className="mt-4 space-y-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-800">預結算分配／轉移（15 分鐘）</p>
              <div className="max-h-[360px] overflow-y-auto">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 z-[1] bg-slate-100 text-slate-900">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">時間</th>
                      <th className="px-3 py-2 text-right font-bold">預結算分配量(kWh)</th>
                      <th className="px-3 py-2 text-right font-bold">轉移成功量(kWh)</th>
                      <th className="px-3 py-2 text-right font-bold">與用電即時差異(kWh)</th>
                    </tr>
                  </thead>
                  <tbody className="text-slate-900">
                    {allocationQuarterRows.map((r) => (
                      <tr key={`alloc-q-${r.timeLabel}`} className="border-t border-slate-200">
                        <td className="px-3 py-1.5 font-mono text-xs font-semibold">{r.timeLabel}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.allocated.toFixed(3)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{r.transferred.toFixed(3)}</td>
                        <td className={`px-3 py-1.5 text-right tabular-nums ${r.diff >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r.diff.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <div className="overflow-x-auto rounded-xl border border-amber-200 bg-amber-50/30">
                <p className="border-b border-amber-200 bg-amber-100/60 px-3 py-2 text-xs font-black text-amber-950">發電量（15 分鐘）— 規劃／即時／誤差</p>
                <div className="max-h-[280px] overflow-y-auto bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-[1] bg-amber-50 text-slate-900">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-bold">時間</th>
                        <th className="px-2 py-1.5 text-right font-bold">規劃量</th>
                        <th className="px-2 py-1.5 text-right font-bold">即時量測</th>
                        <th className="px-2 py-1.5 text-right font-bold">誤差量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterRows.map((r) => {
                        const err = Number((r.generationActual - r.generationPlan).toFixed(3));
                        return (
                          <tr key={`g-q-${r.timeLabel}`} className="border-t border-slate-200">
                            <td className="px-2 py-1 font-mono text-[11px]">{r.timeLabel}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.generationPlan.toFixed(3)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.generationActual.toFixed(3)}</td>
                            <td className={`px-2 py-1 text-right tabular-nums ${err === 0 ? 'text-slate-600' : err > 0 ? 'text-blue-700' : 'text-rose-700'}`}>{err.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-blue-200 bg-blue-50/30">
                <p className="border-b border-blue-200 bg-blue-100/60 px-3 py-2 text-xs font-black text-blue-950">用電量（15 分鐘）— 規劃／即時／誤差</p>
                <div className="max-h-[280px] overflow-y-auto bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-[1] bg-blue-50 text-slate-900">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-bold">時間</th>
                        <th className="px-2 py-1.5 text-right font-bold">規劃量</th>
                        <th className="px-2 py-1.5 text-right font-bold">即時量測</th>
                        <th className="px-2 py-1.5 text-right font-bold">誤差量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterRows.map((r) => {
                        const err = Number((r.loadActual - r.loadPlan).toFixed(3));
                        return (
                          <tr key={`l-q-${r.timeLabel}`} className="border-t border-slate-200">
                            <td className="px-2 py-1 font-mono text-[11px]">{r.timeLabel}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.loadPlan.toFixed(3)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.loadActual.toFixed(3)}</td>
                            <td className={`px-2 py-1 text-right tabular-nums ${err === 0 ? 'text-slate-600' : err > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>{err.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-violet-200 bg-violet-50/30">
                <p className="border-b border-violet-200 bg-violet-100/60 px-3 py-2 text-xs font-black text-violet-950">儲能量（15 分鐘）— 規劃／即時／誤差</p>
                <div className="max-h-[280px] overflow-y-auto bg-white">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 z-[1] bg-violet-50 text-slate-900">
                      <tr>
                        <th className="px-2 py-1.5 text-left font-bold">時間</th>
                        <th className="px-2 py-1.5 text-right font-bold">規劃量</th>
                        <th className="px-2 py-1.5 text-right font-bold">即時量測</th>
                        <th className="px-2 py-1.5 text-right font-bold">誤差量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quarterRows.map((r) => {
                        const err = Number((r.storageActual - r.storagePlan).toFixed(3));
                        return (
                          <tr key={`s-q-${r.timeLabel}`} className="border-t border-slate-200">
                            <td className="px-2 py-1 font-mono text-[11px]">{r.timeLabel}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.storagePlan.toFixed(3)}</td>
                            <td className="px-2 py-1 text-right tabular-nums">{r.storageActual.toFixed(3)}</td>
                            <td className={`px-2 py-1 text-right tabular-nums ${err === 0 ? 'text-slate-600' : err > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{err.toFixed(3)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <p className="text-xs font-semibold text-slate-600">
              誤差量定義為「即時量測 − 規劃量」（kWh）。儲能行含充／放電方向，與儲能圖同一欄位邏輯。
            </p>
          </div>
        )}

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
    </div>
  );
}
