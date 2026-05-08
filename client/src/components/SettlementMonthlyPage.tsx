import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

type GenerationDetailRow = {
  slot: string;
  g1Name: string;
  g1: number;
  g2Name: string;
  g2: number;
  g3Name: string;
  g3: number;
  g4Name: string;
  g4: number;
  toContract: number;
  toStorage: number;
  total: number;
};

type StorageLedgerRow = {
  date: string;
  openingMWh: number;
  chargeMWh: number;
  dischargeMWh: number;
  closingMWh: number;
  isValid: boolean;
};

/** 4.2 月結算：五欄桑基（發電端／儲能餘額 → 合約數量／儲能 → 用電端／轉移量 → 成功匹配／存入／餘電） */
export default function SettlementMonthlyPage() {
  const [enlarge, setEnlarge] = useState(false);
  const [paletteMode, setPaletteMode] = useState<'A' | 'B'>('A');
  const [activeNode, setActiveNode] = useState<string | null>('發電端');
  const [openLeftDetail, setOpenLeftDetail] = useState(true);
  const [openRightDetail, setOpenRightDetail] = useState(true);
  const [openContractLeftDetail, setOpenContractLeftDetail] = useState(true);
  const [openContractRightDetail, setOpenContractRightDetail] = useState(true);
  const [openStorageLeftDetail, setOpenStorageLeftDetail] = useState(true);
  const [openStorageRightDetail, setOpenStorageRightDetail] = useState(true);
  const [openLoadLeftDetail, setOpenLoadLeftDetail] = useState(true);
  const [openLoadRightDetail, setOpenLoadRightDetail] = useState(true);
  const [openSuccessLeftDetail, setOpenSuccessLeftDetail] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState('00:00');
  const [selectedContractSlot, setSelectedContractSlot] = useState('00:00');
  const [selectedStorageSlot, setSelectedStorageSlot] = useState('00:00');
  const [selectedSuccessSlot, setSelectedSuccessSlot] = useState('00:00');
  const flowToContractBySlot: Record<string, number> = {
    '00:00': 110,
    '04:00': 120,
    '08:00': 110,
    '12:00': 90,
    '16:00': 120,
    '20:00': 100,
  };
  const flowToStorageBySlot: Record<string, number> = {
    '12:00': 230,
  };
  /** 發電端直接流向餘電（未進合約），與合約出口拆開以免重複計入 */
  const flowToSurplus = 120;

  /** 桑基圖：合約數量總流出＝流入（650）＝640 至用電端 +10 至餘電 */
  const SANKEY_CONTRACT_TO_LOAD = 640;
  const SANKEY_CONTRACT_TO_SURPLUS = 10;
  /** 用電端總流出＝流入（640）＝620 匹配成功 +20 餘電 */
  const SANKEY_LOAD_TO_SUCCESS = 620;
  const SANKEY_LOAD_TO_SURPLUS = 20;

  const palette =
    paletteMode === 'A'
      ? {
          generation: '#f59e0b',
          contract: '#92400e',
          storage: '#7c3aed',
          battery: '#0f766e',
          success: '#059669',
          surplus: '#ea580c',
          text: '#0f172a',
          background: '#f8fafc',
          flowSuccess: '#22c55e',
          flowFail: '#ef4444',
          flowContract: '#f97316',
          flowStorage: '#a855f7',
        }
      : {
          generation: '#78909C',
          contract: '#90A4AE',
          storage: '#9575CD',
          battery: '#B39DDB',
          success: '#81C784',
          surplus: '#BDBDBD',
          text: '#455A64',
          background: '#F5F5F5',
          flowSuccess: '#81C784',
          flowFail: '#BDBDBD',
          flowContract: '#90A4AE',
          flowStorage: '#9575CD',
        };

  const generationRows: GenerationDetailRow[] = [
    { slot: '00:00', g1Name: 'G1 太陽能A', g1: 30, g2Name: 'G2 太陽能B', g2: 36, g3Name: 'G3 風力A', g3: 34, g4Name: 'G4 生質能', g4: 40, toContract: flowToContractBySlot['00:00'] ?? 0, toStorage: flowToStorageBySlot['00:00'] ?? 0, total: 140 },
    { slot: '04:00', g1Name: 'G1 太陽能A', g1: 34, g2Name: 'G2 太陽能B', g2: 41, g3Name: 'G3 風力A', g3: 40, g4Name: 'G4 生質能', g4: 45, toContract: flowToContractBySlot['04:00'] ?? 0, toStorage: flowToStorageBySlot['04:00'] ?? 0, total: 160 },
    { slot: '08:00', g1Name: 'G1 太陽能A', g1: 32, g2Name: 'G2 太陽能B', g2: 39, g3Name: 'G3 風力A', g3: 37, g4Name: 'G4 生質能', g4: 42, toContract: flowToContractBySlot['08:00'] ?? 0, toStorage: flowToStorageBySlot['08:00'] ?? 0, total: 150 },
    { slot: '12:00', g1Name: 'G1 太陽能A', g1: 52, g2Name: 'G2 太陽能B', g2: 61, g3Name: 'G3 風力A', g3: 59, g4Name: 'G4 生質能', g4: 68, toContract: flowToContractBySlot['12:00'] ?? 0, toStorage: flowToStorageBySlot['12:00'] ?? 0, total: 240 },
    { slot: '16:00', g1Name: 'G1 太陽能A', g1: 38, g2Name: 'G2 太陽能B', g2: 46, g3Name: 'G3 風力A', g3: 44, g4Name: 'G4 生質能', g4: 52, toContract: flowToContractBySlot['16:00'] ?? 0, toStorage: flowToStorageBySlot['16:00'] ?? 0, total: 180 },
    { slot: '20:00', g1Name: 'G1 太陽能A', g1: 28, g2Name: 'G2 太陽能B', g2: 33, g3Name: 'G3 風力A', g3: 32, g4Name: 'G4 生質能', g4: 37, toContract: flowToContractBySlot['20:00'] ?? 0, toStorage: flowToStorageBySlot['20:00'] ?? 0, total: 130 },
  ];

  const generationTotals = generationRows.reduce(
    (acc, row) => {
      acc.g1 += row.g1;
      acc.g2 += row.g2;
      acc.g3 += row.g3;
      acc.g4 += row.g4;
      acc.toContract += row.toContract;
      acc.toStorage += row.toStorage;
      acc.total += row.total;
      return acc;
    },
    { g1: 0, g2: 0, g3: 0, g4: 0, toContract: 0, toStorage: 0, total: 0 },
  );
  /** 各時段「合約數量→用電端」分配（加總＝640）；餘電列加總＝10，與桑基合約出口一致 */
  const contractMatchRows = [
    { slot: '00:00', totalMatchedGeneration: 108, l1: 37, l2: 35, l3: 36, unmatched: 2 },
    { slot: '04:00', totalMatchedGeneration: 118, l1: 39, l2: 39, l3: 40, unmatched: 2 },
    { slot: '08:00', totalMatchedGeneration: 108, l1: 35, l2: 36, l3: 37, unmatched: 2 },
    { slot: '12:00', totalMatchedGeneration: 89, l1: 30, l2: 30, l3: 29, unmatched: 1 },
    { slot: '16:00', totalMatchedGeneration: 118, l1: 39, l2: 39, l3: 40, unmatched: 2 },
    { slot: '20:00', totalMatchedGeneration: 99, l1: 34, l2: 33, l3: 32, unmatched: 1 },
  ];
  const contractMatchTotals = contractMatchRows.reduce(
    (acc, row) => {
      acc.totalMatchedGeneration += row.totalMatchedGeneration;
      acc.l1 += row.l1;
      acc.l2 += row.l2;
      acc.l3 += row.l3;
      acc.unmatched += row.unmatched;
      return acc;
    },
    { totalMatchedGeneration: 0, l1: 0, l2: 0, l3: 0, unmatched: 0 },
  );

  /** 用電端節點：依各時段合約流入比例拆分「→成功匹配」620、「→餘電」20 */
  const loadOutboundRows = useMemo(() => {
    const totalIn = SANKEY_CONTRACT_TO_LOAD;
    let accSuccess = 0;
    let accSurplus = 0;
    return contractMatchRows.map((row, i) => {
      const last = i === contractMatchRows.length - 1;
      if (last) {
        return {
          slot: row.slot,
          fromContract: row.totalMatchedGeneration,
          toSuccessMatch: SANKEY_LOAD_TO_SUCCESS - accSuccess,
          toSurplus: SANKEY_LOAD_TO_SURPLUS - accSurplus,
        };
      }
      const toSuccessMatch = Math.round((SANKEY_LOAD_TO_SUCCESS * row.totalMatchedGeneration) / totalIn);
      const toSurplus = Math.round((SANKEY_LOAD_TO_SURPLUS * row.totalMatchedGeneration) / totalIn);
      accSuccess += toSuccessMatch;
      accSurplus += toSurplus;
      return { slot: row.slot, fromContract: row.totalMatchedGeneration, toSuccessMatch, toSurplus };
    });
  }, [contractMatchRows]);

  const storageTransferRows = [
    { slot: '00:00', totalToLoadTransfer: 40, l1: 14, l2: 13, l3: 13, toStorageDeposit: 20 },
    { slot: '04:00', totalToLoadTransfer: 40, l1: 13, l2: 13, l3: 14, toStorageDeposit: 20 },
    { slot: '08:00', totalToLoadTransfer: 40, l1: 13, l2: 14, l3: 13, toStorageDeposit: 20 },
    { slot: '12:00', totalToLoadTransfer: 35, l1: 12, l2: 12, l3: 11, toStorageDeposit: 20 },
    { slot: '16:00', totalToLoadTransfer: 50, l1: 17, l2: 16, l3: 17, toStorageDeposit: 25 },
    { slot: '20:00', totalToLoadTransfer: 45, l1: 15, l2: 15, l3: 15, toStorageDeposit: 25 },
  ];
  const storageTransferTotals = storageTransferRows.reduce(
    (acc, row) => {
      acc.totalToLoadTransfer += row.totalToLoadTransfer;
      acc.l1 += row.l1;
      acc.l2 += row.l2;
      acc.l3 += row.l3;
      acc.toStorageDeposit += row.toStorageDeposit;
      return acc;
    },
    { totalToLoadTransfer: 0, l1: 0, l2: 0, l3: 0, toStorageDeposit: 0 },
  );

  /** 桑基：儲能→用電端轉移→成功匹配 總量（與 links 一致） */
  const SANKEY_TRANSFER_TO_SUCCESS = 235;

  /** 成功匹配量左側：契約路徑與儲能轉移路徑各自依該時段發電結構攤至 G1–G4 電號 */
  const successMatchGenRows = useMemo(() => {
    const tt = storageTransferTotals.totalToLoadTransfer || 1;
    let accTransfer = 0;
    const transferPathBySlot = storageTransferRows.map((st, i) => {
      const last = i === storageTransferRows.length - 1;
      if (last) return SANKEY_TRANSFER_TO_SUCCESS - accTransfer;
      const v = Math.round((SANKEY_TRANSFER_TO_SUCCESS * st.totalToLoadTransfer) / tt);
      accTransfer += v;
      return v;
    });
    return contractMatchRows.map((cm, idx) => {
      const gen = generationRows[idx];
      const lo = loadOutboundRows[idx];
      const contractPathKwh = lo.toSuccessMatch;
      const transferPathKwh = transferPathBySlot[idx] ?? 0;
      const splitByGen = (amount: number) => {
        const t = gen.total || 1;
        const g1 = Math.round((amount * gen.g1) / t);
        const g2 = Math.round((amount * gen.g2) / t);
        const g3 = Math.round((amount * gen.g3) / t);
        const g4 = amount - g1 - g2 - g3;
        return { g1, g2, g3, g4 };
      };
      const c = splitByGen(contractPathKwh);
      const tr = splitByGen(transferPathKwh);
      return {
        slot: cm.slot,
        contractPathKwh,
        transferPathKwh,
        totalSlotSuccess: contractPathKwh + transferPathKwh,
        cg1: c.g1,
        cg2: c.g2,
        cg3: c.g3,
        cg4: c.g4,
        tg1: tr.g1,
        tg2: tr.g2,
        tg3: tr.g3,
        tg4: tr.g4,
        g1Name: gen.g1Name,
        g2Name: gen.g2Name,
        g3Name: gen.g3Name,
        g4Name: gen.g4Name,
      };
    });
  }, [loadOutboundRows, storageTransferTotals.totalToLoadTransfer, storageTransferRows]);

  const storageChargeQuarterRatios = [0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.07, 0.07, 0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.08, 0.09];
  const buildStorageQuarterSeries = (base: number) => {
    const values = storageChargeQuarterRatios.map((ratio) => Math.round(base * ratio));
    const diff = base - values.reduce((sum, value) => sum + value, 0);
    values[values.length - 1] += diff;
    return values;
  };
  const storageChargeFromGenerationTotal = generationTotals.toStorage;
  const storageChargeFromBalance7dTotal = 150;
  const storageChargeSuccessTotal = storageChargeFromGenerationTotal + storageChargeFromBalance7dTotal;
  const storageChargeFromGenerationQuarter = buildStorageQuarterSeries(storageChargeFromGenerationTotal);
  const storageChargeFromBalanceQuarter = buildStorageQuarterSeries(storageChargeFromBalance7dTotal);
  const storageChargeQuarterRows = Array.from({ length: 16 }).map((_, idx) => {
    const hour = 10 + Math.floor(idx / 4);
    const minute = (idx % 4) * 15;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const fromGeneration = storageChargeFromGenerationQuarter[idx];
    const fromBalance = storageChargeFromBalanceQuarter[idx];
    return {
      time,
      fromGeneration,
      transferSuccess: fromGeneration + fromBalance,
      fromBalance,
    };
  });

  const selectedSlotRow = generationRows.find((row) => row.slot === selectedSlot) ?? generationRows[0];
  const splitRatios = [0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.07, 0.07, 0.06, 0.06, 0.06, 0.06, 0.07, 0.07, 0.08, 0.09];
  const slotHour = Number.parseInt(selectedSlotRow.slot.split(':')[0] ?? '0', 10);
  const buildQuarterSeries = (base: number) => {
    const values = splitRatios.map((ratio) => Math.round(base * ratio));
    const diff = base - values.reduce((sum, value) => sum + value, 0);
    values[values.length - 1] += diff;
    return values;
  };
  const qG1 = buildQuarterSeries(selectedSlotRow.g1);
  const qG2 = buildQuarterSeries(selectedSlotRow.g2);
  const qG3 = buildQuarterSeries(selectedSlotRow.g3);
  const qG4 = buildQuarterSeries(selectedSlotRow.g4);
  const quarterRows = Array.from({ length: 16 }).map((_, idx) => {
    const hour = slotHour + Math.floor(idx / 4);
    const minute = (idx % 4) * 15;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const g1 = qG1[idx];
    const g2 = qG2[idx];
    const g3 = qG3[idx];
    const g4 = qG4[idx];
    return { time, g1, g2, g3, g4, total: g1 + g2 + g3 + g4 };
  });
  const selectedContractRow = contractMatchRows.find((row) => row.slot === selectedContractSlot) ?? contractMatchRows[0];
  const contractSlotHour = Number.parseInt(selectedContractRow.slot.split(':')[0] ?? '0', 10);
  const qL1 = buildQuarterSeries(selectedContractRow.l1);
  const qL2 = buildQuarterSeries(selectedContractRow.l2);
  const qL3 = buildQuarterSeries(selectedContractRow.l3);
  const qUnmatched = buildQuarterSeries(selectedContractRow.unmatched);
  const quarterContractRows = Array.from({ length: 16 }).map((_, idx) => {
    const hour = contractSlotHour + Math.floor(idx / 4);
    const minute = (idx % 4) * 15;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const l1 = qL1[idx];
    const l2 = qL2[idx];
    const l3 = qL3[idx];
    const unmatched = qUnmatched[idx];
    return { time, totalMatchedGeneration: l1 + l2 + l3, l1, l2, l3, unmatched };
  });
  const selectedStorageTransferRow = storageTransferRows.find((row) => row.slot === selectedStorageSlot) ?? storageTransferRows[0];
  const storageTransferSlotHour = Number.parseInt(selectedStorageTransferRow.slot.split(':')[0] ?? '0', 10);
  const qStorageL1 = buildQuarterSeries(selectedStorageTransferRow.l1);
  const qStorageL2 = buildQuarterSeries(selectedStorageTransferRow.l2);
  const qStorageL3 = buildQuarterSeries(selectedStorageTransferRow.l3);
  const qStorageDeposit = buildQuarterSeries(selectedStorageTransferRow.toStorageDeposit);
  const storageTransferQuarterRows = Array.from({ length: 16 }).map((_, idx) => {
    const hour = storageTransferSlotHour + Math.floor(idx / 4);
    const minute = (idx % 4) * 15;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const l1 = qStorageL1[idx];
    const l2 = qStorageL2[idx];
    const l3 = qStorageL3[idx];
    const toStorageDeposit = qStorageDeposit[idx];
    return { time, totalToLoadTransfer: l1 + l2 + l3, l1, l2, l3, toStorageDeposit };
  });

  const selectedSuccessGenRow = successMatchGenRows.find((r) => r.slot === selectedSuccessSlot) ?? successMatchGenRows[0];
  const successGenSlotHour = Number.parseInt(selectedSuccessGenRow.slot.split(':')[0] ?? '0', 10);
  const qSuccContract = buildQuarterSeries(selectedSuccessGenRow.contractPathKwh);
  const qSuccTransfer = buildQuarterSeries(selectedSuccessGenRow.transferPathKwh);
  const quarterSuccessRows = Array.from({ length: 16 }).map((_, idx) => {
    const hour = successGenSlotHour + Math.floor(idx / 4);
    const minute = (idx % 4) * 15;
    const time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    const contractPath = qSuccContract[idx];
    const transferPath = qSuccTransfer[idx];
    return { time, contractPath, transferPath, total: contractPath + transferPath };
  });

  const storageLedgerRows: StorageLedgerRow[] = [
    { date: '04/24', openingMWh: 56, chargeMWh: 14, dischargeMWh: 10, closingMWh: 60, isValid: true },
    { date: '04/25', openingMWh: 60, chargeMWh: 16, dischargeMWh: 12, closingMWh: 64, isValid: true },
    { date: '04/26', openingMWh: 64, chargeMWh: 12, dischargeMWh: 15, closingMWh: 61, isValid: true },
    { date: '04/27', openingMWh: 61, chargeMWh: 18, dischargeMWh: 9, closingMWh: 70, isValid: true },
    { date: '04/28', openingMWh: 70, chargeMWh: 9, dischargeMWh: 17, closingMWh: 62, isValid: true },
    { date: '04/29', openingMWh: 62, chargeMWh: 15, dischargeMWh: 11, closingMWh: 66, isValid: true },
    { date: '04/30', openingMWh: 66, chargeMWh: 13, dischargeMWh: 14, closingMWh: 65, isValid: true },
  ];

  const storageSummary = storageLedgerRows.reduce(
    (acc, row) => {
      if (row.isValid) acc.validDays += 1;
      acc.totalClosingMWh += row.closingMWh;
      return acc;
    },
    { validDays: 0, totalClosingMWh: 0 },
  );

  const option = useMemo<EChartsOption>(() => {
    const edge = enlarge ? 52 : 44;
    const labelCommon = {
      color: palette.text,
      fontSize: enlarge ? 11 : 9,
      fontWeight: 700,
      lineHeight: 15,
      width: enlarge ? 108 : 84,
      distance: 6,
      overflow: 'breakAll' as const,
    };

    const nodes = [
      { name: '發電端', depth: 0, itemStyle: { color: palette.generation }, label: { ...labelCommon, position: 'left' as const, distance: 8 } },
      { name: '儲能餘額', depth: 0, itemStyle: { color: palette.battery }, label: { ...labelCommon, position: 'left' as const, distance: 8 } },
      { name: '合約數量', depth: 1, itemStyle: { color: palette.contract }, label: { ...labelCommon, position: 'inside' as const } },
      { name: '儲能', depth: 1, itemStyle: { color: palette.storage }, label: { ...labelCommon, position: 'inside' as const } },
      { name: '用電端', depth: 2, itemStyle: { color: palette.contract }, label: { ...labelCommon, position: 'right' as const, distance: 10 } },
      { name: '用電端轉移量', depth: 2, itemStyle: { color: palette.contract }, label: { ...labelCommon, position: 'right' as const, distance: 10 } },
      { name: '成功匹配量', depth: 3, itemStyle: { color: palette.success }, label: { ...labelCommon, position: 'right' as const, distance: 12 } },
      { name: '儲能存入量', depth: 3, itemStyle: { color: palette.storage }, label: { ...labelCommon, position: 'right' as const, distance: 12 } },
      { name: '餘電', depth: 3, itemStyle: { color: palette.surplus }, label: { ...labelCommon, position: 'right' as const, distance: 12 } },
    ];

    /** 不指定連線 color，改由 series.lineStyle.color: 'gradient' 依兩端節點 itemStyle 配色漸層 */
    const links = [
      { source: '發電端', target: '合約數量', value: generationTotals.toContract },
      { source: '發電端', target: '儲能', value: generationTotals.toStorage },
      { source: '發電端', target: '餘電', value: flowToSurplus },
      { source: '儲能餘額', target: '儲能', value: 150 },
      { source: '合約數量', target: '用電端', value: SANKEY_CONTRACT_TO_LOAD },
      { source: '合約數量', target: '餘電', value: SANKEY_CONTRACT_TO_SURPLUS },
      { source: '儲能', target: '用電端轉移量', value: 250 },
      { source: '儲能', target: '儲能存入量', value: 130 },
      { source: '用電端', target: '成功匹配量', value: SANKEY_LOAD_TO_SUCCESS },
      { source: '用電端', target: '餘電', value: SANKEY_LOAD_TO_SURPLUS },
      { source: '用電端轉移量', target: '成功匹配量', value: 235 },
      { source: '用電端轉移量', target: '餘電', value: 15 },
    ];

    return {
      animation: false,
      tooltip: {
        trigger: 'item',
        formatter: (p: unknown) => {
          const item = p as {
            name?: string;
            dataType?: string;
            value?: number;
            data?: { source?: string; target?: string; value?: number };
          };
          if (item.dataType === 'edge') {
            const source = item.data?.source ?? '';
            const target = item.data?.target ?? '';
            const value = item.data?.value ?? item.value ?? 0;
            return `${source} → ${target}<br/>流量：${value}`;
          }
          return `${item.name ?? ''}<br/>流量：${item.value ?? 0}`;
        },
      },
      series: [
        {
          type: 'sankey',
          left: edge,
          right: enlarge ? 140 : 120,
          top: edge,
          bottom: edge,
          nodeWidth: 10,
          nodeGap: enlarge ? 42 : 36,
          nodeAlign: 'justify',
          layoutIterations: 64,
          emphasis: {
            focus: 'adjacency',
            lineStyle: { color: 'gradient', opacity: 0.88 },
          },
          draggable: true,
          roam: true,
          lineStyle: {
            color: 'gradient',
            curveness: 0.32,
            opacity: 0.62,
          },
          label: labelCommon,
          data: nodes,
          links,
        },
      ],
    };
  }, [enlarge, palette]);

  const chartEvents = {
    click: (params: unknown) => {
      const node = params as { dataType?: string; name?: string };
      if (node.dataType === 'node' && node.name) setActiveNode(node.name);
    },
  };

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      <section className="rounded-2xl border border-slate-300 p-5 shadow-sm" style={{ backgroundColor: palette.background, color: palette.text }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">4.2 月結算｜能源流動總覽（桑基）</h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              「合約數量」右側流出加總等於流入（650）＝640 至用電端＋10 至餘電；用電端總流出等於流入（640）＝620 成功匹配＋20 餘電。餘電亦含發電端直連與用電端轉移之失敗流向。數字為示範假資料。圖表可左右捲動或拖曳縮放。
            </p>
          </div>
          <button
            type="button"
            onClick={() => setEnlarge((v) => !v)}
            className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700"
          >
            {enlarge ? '縮小圖表' : '放大圖表'}
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaletteMode('A')}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                paletteMode === 'A' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              配色A
            </button>
            <button
              type="button"
              onClick={() => setPaletteMode('B')}
              className={`rounded-full border px-3 py-1 text-xs font-bold ${
                paletteMode === 'B' ? 'border-slate-700 bg-slate-700 text-white' : 'border-slate-300 bg-white text-slate-700'
              }`}
            >
              配色B
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-600 sm:grid-cols-5 sm:text-xs">
          <span className="rounded-md bg-amber-50 py-1 text-amber-900">① 發電端／儲能餘額</span>
          <span className="rounded-md bg-indigo-50 py-1 text-indigo-900">② 合約數量／儲能</span>
          <span className="rounded-md bg-blue-50 py-1 text-blue-900">③ 用電端／轉移量</span>
          <span className="rounded-md bg-emerald-50 py-1 text-emerald-900 sm:col-span-2">④ 成功匹配／存入／餘電</span>
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
          <div className={`${enlarge ? 'h-[620px] min-w-[1100px]' : 'h-[520px] min-w-[1020px]'}`}>
            <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} onEvents={chartEvents} />
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-bold text-slate-600">
            可點擊節點開啟明細（發電端、合約數量、用電端、成功匹配量、儲能、儲能餘額）。
          </p>
          {activeNode === '發電端' ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenLeftDetail((v) => !v)}
                  className="w-full rounded-md bg-amber-50 px-3 py-2 text-left text-sm font-bold text-amber-900"
                >
                  發電端左側明細（時段發電）{openLeftDetail ? '▲' : '▼'}
                </button>
                {openLeftDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[780px] text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left">時段</th>
                            <th className="px-2 py-1 text-right">G1（資源電號/名稱）</th>
                            <th className="px-2 py-1 text-right">G2（資源電號/名稱）</th>
                            <th className="px-2 py-1 text-right">G3（資源電號/名稱）</th>
                            <th className="px-2 py-1 text-right">G4（資源電號/名稱）</th>
                            <th className="px-2 py-1 text-right">總和</th>
                          </tr>
                        </thead>
                        <tbody>
                          {generationRows.map((row) => (
                            <tr
                              key={row.slot}
                              onClick={() => setSelectedSlot(row.slot)}
                              className={`cursor-pointer border-t border-slate-200 ${
                                selectedSlot === row.slot ? 'bg-amber-50' : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-2 py-1 font-bold">{row.slot}</td>
                              <td className="px-2 py-1 text-right">{row.g1Name}：{row.g1}</td>
                              <td className="px-2 py-1 text-right">{row.g2Name}：{row.g2}</td>
                              <td className="px-2 py-1 text-right">{row.g3Name}：{row.g3}</td>
                              <td className="px-2 py-1 text-right">{row.g4Name}：{row.g4}</td>
                              <td className="px-2 py-1 text-right font-black">{row.total}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right">{generationTotals.g1}</td>
                            <td className="px-2 py-1 text-right">{generationTotals.g2}</td>
                            <td className="px-2 py-1 text-right">{generationTotals.g3}</td>
                            <td className="px-2 py-1 text-right">{generationTotals.g4}</td>
                            <td className="px-2 py-1 text-right">{generationTotals.total}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="pb-2 text-[11px] font-bold text-slate-600">
                        點選時段 `{selectedSlot}` 的 15 分鐘明細（每 4 小時區間，共 16 筆）
                      </p>
                      <div className="max-h-52 overflow-y-auto rounded border border-slate-200">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1 text-left">時間</th>
                              <th className="px-2 py-1 text-right">G1</th>
                              <th className="px-2 py-1 text-right">G2</th>
                              <th className="px-2 py-1 text-right">G3</th>
                              <th className="px-2 py-1 text-right">G4</th>
                              <th className="px-2 py-1 text-right">總和</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quarterRows.map((row) => (
                              <tr key={row.time} className="border-t border-slate-200">
                                <td className="px-2 py-1">{row.time}</td>
                                <td className="px-2 py-1 text-right">{row.g1}</td>
                                <td className="px-2 py-1 text-right">{row.g2}</td>
                                <td className="px-2 py-1 text-right">{row.g3}</td>
                                <td className="px-2 py-1 text-right">{row.g4}</td>
                                <td className="px-2 py-1 text-right font-bold">{row.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenRightDetail((v) => !v)}
                  className="w-full rounded-md bg-emerald-50 px-3 py-2 text-left text-sm font-bold text-emerald-900"
                >
                  發電端右側明細（流向拆分）{openRightDetail ? '▲' : '▼'}
                </button>
                {openRightDetail ? (
                  <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                    {generationRows.map((row) => (
                      <div key={`${row.slot}-flow`} className="rounded bg-slate-50 px-2 py-1">
                        <div className="flex items-center justify-between">
                          <span>{row.slot} → 合約數量</span>
                          <span>{row.toContract}</span>
                        </div>
                        {row.toStorage > 0 ? (
                          <div className="mt-1 flex items-center justify-between text-purple-700">
                            <span>{row.slot} → 儲能（10:00-14:00）</span>
                            <span>{row.toStorage}</span>
                          </div>
                        ) : null}
                      </div>
                    ))}
                    <div className="border-t border-slate-200 pt-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>流向合約總量</span>
                        <span>{generationTotals.toContract}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span>流向儲能總量（10:00-14:00）</span>
                        <span>{generationTotals.toStorage}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-red-600">
                        <span>流向餘電</span>
                        <span>{flowToSurplus}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : activeNode === '合約數量' ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenContractLeftDetail((v) => !v)}
                  className="w-full rounded-md bg-amber-50 px-3 py-2 text-left text-sm font-bold text-amber-900"
                >
                  合約數量左側明細（來自發電端右側流向）{openContractLeftDetail ? '▲' : '▼'}
                </button>
                {openContractLeftDetail ? (
                  <div className="mt-2 space-y-1 text-xs font-semibold text-slate-700">
                    {generationRows.map((row) => (
                      <div key={`${row.slot}-contract-in`} className="rounded bg-slate-50 px-2 py-1">
                        <div className="flex items-center justify-between">
                          <span>{row.slot} → 合約數量</span>
                          <span>{row.toContract}</span>
                        </div>
                      </div>
                    ))}
                    <div className="border-t border-slate-200 pt-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>流入合約數量總量</span>
                        <span>{generationTotals.toContract}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenContractRightDetail((v) => !v)}
                  className="w-full rounded-md bg-emerald-50 px-3 py-2 text-left text-sm font-bold text-emerald-900"
                >
                  合約數量右側明細（流向用電端／餘電）{openContractRightDetail ? '▲' : '▼'}
                </button>
                {openContractRightDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>流入用電端（與桑基 640 一致）</span>
                        <span>{contractMatchTotals.totalMatchedGeneration}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-red-600">
                        <span>流入餘電（與桑基 10 一致）</span>
                        <span>{contractMatchTotals.unmatched}</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[680px] text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left">時段</th>
                            <th className="px-2 py-1 text-right">分配至用電端</th>
                            <th className="px-2 py-1 text-right">L1</th>
                            <th className="px-2 py-1 text-right">L2</th>
                            <th className="px-2 py-1 text-right">L3</th>
                            <th className="px-2 py-1 text-right">合約出口·餘電</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractMatchRows.map((row) => (
                            <tr
                              key={`${row.slot}-contract-out`}
                              onClick={() => setSelectedContractSlot(row.slot)}
                              className={`cursor-pointer border-t border-slate-200 ${
                                selectedContractSlot === row.slot ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-2 py-1 font-bold">{row.slot}</td>
                              <td className="px-2 py-1 text-right font-black text-emerald-700">{row.totalMatchedGeneration}</td>
                              <td className="px-2 py-1 text-right">{row.l1}</td>
                              <td className="px-2 py-1 text-right">{row.l2}</td>
                              <td className="px-2 py-1 text-right">{row.l3}</td>
                              <td className="px-2 py-1 text-right text-red-600">{row.unmatched}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right text-emerald-700">{contractMatchTotals.totalMatchedGeneration}</td>
                            <td className="px-2 py-1 text-right">{contractMatchTotals.l1}</td>
                            <td className="px-2 py-1 text-right">{contractMatchTotals.l2}</td>
                            <td className="px-2 py-1 text-right">{contractMatchTotals.l3}</td>
                            <td className="px-2 py-1 text-right text-red-600">{contractMatchTotals.unmatched}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="pb-2 text-[11px] font-bold text-slate-600">
                        點選時段 `{selectedContractSlot}` 的 15 分鐘匹配明細（每 4 小時區間，共 16 筆）
                      </p>
                      <div className="max-h-52 overflow-y-auto rounded border border-slate-200">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1 text-left">時間</th>
                              <th className="px-2 py-1 text-right">分配至用電端</th>
                              <th className="px-2 py-1 text-right">L1</th>
                              <th className="px-2 py-1 text-right">L2</th>
                              <th className="px-2 py-1 text-right">L3</th>
                              <th className="px-2 py-1 text-right">合約出口·餘電</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quarterContractRows.map((row) => (
                              <tr key={`${row.time}-contract-quarter`} className="border-t border-slate-200">
                                <td className="px-2 py-1">{row.time}</td>
                                <td className="px-2 py-1 text-right font-bold text-emerald-700">{row.totalMatchedGeneration}</td>
                                <td className="px-2 py-1 text-right">{row.l1}</td>
                                <td className="px-2 py-1 text-right">{row.l2}</td>
                                <td className="px-2 py-1 text-right">{row.l3}</td>
                                <td className="px-2 py-1 text-right text-red-600">{row.unmatched}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : activeNode === '用電端' ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenLoadLeftDetail((v) => !v)}
                  className="w-full rounded-md bg-amber-50 px-3 py-2 text-left text-sm font-bold text-amber-900"
                >
                  用電端左側明細（來自合約數量）{openLoadLeftDetail ? '▲' : '▼'}
                </button>
                {openLoadLeftDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>合約數量 → 用電端（加總）</span>
                        <span>{SANKEY_CONTRACT_TO_LOAD}</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[420px] text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left">時段</th>
                            <th className="px-2 py-1 text-right">來自合約數量(kWh)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractMatchRows.map((row) => (
                            <tr key={`load-in-${row.slot}`} className="border-t border-slate-200 bg-white">
                              <td className="px-2 py-1 font-bold">{row.slot}</td>
                              <td className="px-2 py-1 text-right tabular-nums">{row.totalMatchedGeneration}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right">{contractMatchTotals.totalMatchedGeneration}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenLoadRightDetail((v) => !v)}
                  className="w-full rounded-md bg-emerald-50 px-3 py-2 text-left text-sm font-bold text-emerald-900"
                >
                  用電端右側明細（成功匹配量／餘電）{openLoadRightDetail ? '▲' : '▼'}
                </button>
                {openLoadRightDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>→ 成功匹配量（加總）</span>
                        <span>{SANKEY_LOAD_TO_SUCCESS}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-red-600">
                        <span>→ 餘電（加總）</span>
                        <span>{SANKEY_LOAD_TO_SURPLUS}</span>
                      </div>
                    </div>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[520px] text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left">時段</th>
                            <th className="px-2 py-1 text-right">成功匹配量(kWh)</th>
                            <th className="px-2 py-1 text-right">餘電(kWh)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadOutboundRows.map((row) => (
                            <tr key={`load-out-${row.slot}`} className="border-t border-slate-200 bg-white">
                              <td className="px-2 py-1 font-bold">{row.slot}</td>
                              <td className="px-2 py-1 text-right tabular-nums text-emerald-700">{row.toSuccessMatch}</td>
                              <td className="px-2 py-1 text-right tabular-nums text-red-600">{row.toSurplus}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right text-emerald-700">{SANKEY_LOAD_TO_SUCCESS}</td>
                            <td className="px-2 py-1 text-right text-red-600">{SANKEY_LOAD_TO_SURPLUS}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : activeNode === '成功匹配量' ? (
            <div className="mt-3 space-y-4">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenSuccessLeftDetail((v) => !v)}
                  className="w-full rounded-md bg-amber-50 px-3 py-2 text-left text-sm font-bold text-amber-900"
                >
                  成功匹配量左側明細（用電端／轉移量 → 依發電電號攤提）{openSuccessLeftDetail ? '▲' : '▼'}
                </button>
                {openSuccessLeftDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <p className="text-[11px] font-semibold text-slate-600">
                      契約路徑對應「用電端→成功匹配」之總量（620）在各時段之分攤；儲能轉移路徑對應「用電端轉移量→成功匹配」（235）依各時段轉移比例拆分。下表將兩路徑電量依該時段發電結構比例攤至 G1–G4 發電電號。
                    </p>
                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[920px] text-[11px]">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left" rowSpan={2}>
                              時段
                            </th>
                            <th className="px-2 py-1 text-center border-l border-slate-200" colSpan={5}>
                              契約路徑（用電端）
                            </th>
                            <th className="px-2 py-1 text-center border-l border-slate-200" colSpan={5}>
                              儲能轉移路徑
                            </th>
                            <th className="px-2 py-1 text-right border-l border-slate-200" rowSpan={2}>
                              時段合計
                            </th>
                          </tr>
                          <tr>
                            <th className="px-2 py-1 text-right border-l border-slate-200">小計</th>
                            <th className="px-2 py-1 text-right">G1</th>
                            <th className="px-2 py-1 text-right">G2</th>
                            <th className="px-2 py-1 text-right">G3</th>
                            <th className="px-2 py-1 text-right">G4</th>
                            <th className="px-2 py-1 text-right border-l border-slate-200">小計</th>
                            <th className="px-2 py-1 text-right">G1</th>
                            <th className="px-2 py-1 text-right">G2</th>
                            <th className="px-2 py-1 text-right">G3</th>
                            <th className="px-2 py-1 text-right">G4</th>
                          </tr>
                        </thead>
                        <tbody>
                          {successMatchGenRows.map((row) => (
                            <tr
                              key={`succ-gen-${row.slot}`}
                              onClick={() => setSelectedSuccessSlot(row.slot)}
                              className={`cursor-pointer border-t border-slate-200 ${
                                selectedSuccessSlot === row.slot ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-2 py-1 font-bold">{row.slot}</td>
                              <td className="px-2 py-1 text-right border-l border-slate-200 font-semibold text-emerald-800">{row.contractPathKwh}</td>
                              <td className="px-2 py-1 text-right">{row.cg1}</td>
                              <td className="px-2 py-1 text-right">{row.cg2}</td>
                              <td className="px-2 py-1 text-right">{row.cg3}</td>
                              <td className="px-2 py-1 text-right">{row.cg4}</td>
                              <td className="px-2 py-1 text-right border-l border-slate-200 font-semibold text-indigo-800">{row.transferPathKwh}</td>
                              <td className="px-2 py-1 text-right">{row.tg1}</td>
                              <td className="px-2 py-1 text-right">{row.tg2}</td>
                              <td className="px-2 py-1 text-right">{row.tg3}</td>
                              <td className="px-2 py-1 text-right">{row.tg4}</td>
                              <td className="px-2 py-1 text-right border-l border-slate-200 font-black">{row.totalSlotSuccess}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right border-l border-slate-200 text-emerald-800">{SANKEY_LOAD_TO_SUCCESS}</td>
                            <td className="px-2 py-1 text-right" colSpan={4}>
                              —
                            </td>
                            <td className="px-2 py-1 text-right border-l border-slate-200 text-indigo-800">{SANKEY_TRANSFER_TO_SUCCESS}</td>
                            <td className="px-2 py-1 text-right" colSpan={4}>
                              —
                            </td>
                            <td className="px-2 py-1 text-right border-l border-slate-200">{SANKEY_LOAD_TO_SUCCESS + SANKEY_TRANSFER_TO_SUCCESS}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500">
                      G 欄位為示範電號對應：{successMatchGenRows[0]?.g1Name} / {successMatchGenRows[0]?.g2Name} / {successMatchGenRows[0]?.g3Name} /{' '}
                      {successMatchGenRows[0]?.g4Name}
                    </p>

                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="pb-2 text-[11px] font-bold text-slate-600">
                        點選時段「{selectedSuccessSlot}」：15 分鐘契約路徑／轉移路徑匹配電量（每 4 小時區間 16 筆）
                      </p>
                      <div className="max-h-52 overflow-y-auto rounded border border-slate-200">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1 text-left">時間</th>
                              <th className="px-2 py-1 text-right">契約路徑(kWh)</th>
                              <th className="px-2 py-1 text-right">轉移路徑(kWh)</th>
                              <th className="px-2 py-1 text-right">合計</th>
                            </tr>
                          </thead>
                          <tbody>
                            {quarterSuccessRows.map((row) => (
                              <tr key={`succ-q-${row.time}`} className="border-t border-slate-200">
                                <td className="px-2 py-1 font-mono">{row.time}</td>
                                <td className="px-2 py-1 text-right text-emerald-700">{row.contractPath}</td>
                                <td className="px-2 py-1 text-right text-indigo-700">{row.transferPath}</td>
                                <td className="px-2 py-1 text-right font-bold">{row.total}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : activeNode === '儲能' ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenStorageLeftDetail((v) => !v)}
                  className="w-full rounded-md bg-amber-50 px-3 py-2 text-left text-sm font-bold text-amber-900"
                >
                  儲能左側明細（10:00-14:00 充電來源）{openStorageLeftDetail ? '▲' : '▼'}
                </button>
                {openStorageLeftDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>發電端存入（10:00-14:00）</span>
                        <span>{storageChargeFromGenerationTotal}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-indigo-700">
                        <span>儲能餘額存入（近 7 天累加）</span>
                        <span>{storageChargeFromBalance7dTotal}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-emerald-700">
                        <span>轉移成功總量（進入儲能）</span>
                        <span>{storageChargeSuccessTotal}</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[700px] text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left">時間（10:00-14:00）</th>
                            <th className="px-2 py-1 text-right">發電端存入量</th>
                            <th className="px-2 py-1 text-right">儲能餘額存入量（7天累加）</th>
                            <th className="px-2 py-1 text-right">轉移成功量</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storageChargeQuarterRows.map((row) => (
                            <tr key={`${row.time}-storage-charge`} className="border-t border-slate-200 bg-white">
                              <td className="px-2 py-1 font-bold">{row.time}</td>
                              <td className="px-2 py-1 text-right">{row.fromGeneration}</td>
                              <td className="px-2 py-1 text-right text-indigo-700">{row.fromBalance}</td>
                              <td className="px-2 py-1 text-right font-bold text-emerald-700">{row.transferSuccess}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right">{storageChargeFromGenerationTotal}</td>
                            <td className="px-2 py-1 text-right text-indigo-700">{storageChargeFromBalance7dTotal}</td>
                            <td className="px-2 py-1 text-right text-emerald-700">{storageChargeSuccessTotal}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <button
                  type="button"
                  onClick={() => setOpenStorageRightDetail((v) => !v)}
                  className="w-full rounded-md bg-emerald-50 px-3 py-2 text-left text-sm font-bold text-emerald-900"
                >
                  儲能右側明細（流向用電端轉移量／儲能存入量）{openStorageRightDetail ? '▲' : '▼'}
                </button>
                {openStorageRightDetail ? (
                  <div className="mt-2 space-y-3 text-xs font-semibold text-slate-700">
                    <div className="rounded border border-slate-200 bg-slate-50 p-2 text-slate-900">
                      <div className="flex items-center justify-between">
                        <span>流向用電端轉移量</span>
                        <span>{storageTransferTotals.totalToLoadTransfer}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-purple-700">
                        <span>流向儲能存入量（未用到）</span>
                        <span>{storageTransferTotals.toStorageDeposit}</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded border border-slate-200">
                      <table className="min-w-[700px] text-xs">
                        <thead className="bg-slate-100 text-slate-700">
                          <tr>
                            <th className="px-2 py-1 text-left">時段</th>
                            <th className="px-2 py-1 text-right">總轉移用電量</th>
                            <th className="px-2 py-1 text-right">L1</th>
                            <th className="px-2 py-1 text-right">L2</th>
                            <th className="px-2 py-1 text-right">L3</th>
                            <th className="px-2 py-1 text-right">儲能存入量（未用到）</th>
                          </tr>
                        </thead>
                        <tbody>
                          {storageTransferRows.map((row) => (
                            <tr
                              key={`${row.slot}-storage-out`}
                              onClick={() => setSelectedStorageSlot(row.slot)}
                              className={`cursor-pointer border-t border-slate-200 ${
                                selectedStorageSlot === row.slot ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                              }`}
                            >
                              <td className="px-2 py-1 font-bold">{row.slot}</td>
                              <td className="px-2 py-1 text-right font-black text-emerald-700">{row.totalToLoadTransfer}</td>
                              <td className="px-2 py-1 text-right">{row.l1}</td>
                              <td className="px-2 py-1 text-right">{row.l2}</td>
                              <td className="px-2 py-1 text-right">{row.l3}</td>
                              <td className="px-2 py-1 text-right text-purple-700">{row.toStorageDeposit}</td>
                            </tr>
                          ))}
                          <tr className="border-t border-slate-300 bg-slate-100 font-black text-slate-900">
                            <td className="px-2 py-1">合計</td>
                            <td className="px-2 py-1 text-right text-emerald-700">{storageTransferTotals.totalToLoadTransfer}</td>
                            <td className="px-2 py-1 text-right">{storageTransferTotals.l1}</td>
                            <td className="px-2 py-1 text-right">{storageTransferTotals.l2}</td>
                            <td className="px-2 py-1 text-right">{storageTransferTotals.l3}</td>
                            <td className="px-2 py-1 text-right text-purple-700">{storageTransferTotals.toStorageDeposit}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="rounded border border-slate-200 bg-white p-2">
                      <p className="pb-2 text-[11px] font-bold text-slate-600">
                        點選時段 `{selectedStorageSlot}` 的 15 分鐘轉移明細（每 4 小時區間，共 16 筆）
                      </p>
                      <div className="max-h-52 overflow-y-auto rounded border border-slate-200">
                        <table className="w-full text-[11px]">
                          <thead className="sticky top-0 bg-slate-100 text-slate-700">
                            <tr>
                              <th className="px-2 py-1 text-left">時間</th>
                              <th className="px-2 py-1 text-right">總轉移用電量</th>
                              <th className="px-2 py-1 text-right">L1</th>
                              <th className="px-2 py-1 text-right">L2</th>
                              <th className="px-2 py-1 text-right">L3</th>
                              <th className="px-2 py-1 text-right">儲能存入量（未用到）</th>
                            </tr>
                          </thead>
                          <tbody>
                            {storageTransferQuarterRows.map((row) => (
                              <tr key={`${row.time}-storage-quarter`} className="border-t border-slate-200">
                                <td className="px-2 py-1">{row.time}</td>
                                <td className="px-2 py-1 text-right font-bold text-emerald-700">{row.totalToLoadTransfer}</td>
                                <td className="px-2 py-1 text-right">{row.l1}</td>
                                <td className="px-2 py-1 text-right">{row.l2}</td>
                                <td className="px-2 py-1 text-right">{row.l3}</td>
                                <td className="px-2 py-1 text-right text-purple-700">{row.toStorageDeposit}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : activeNode === '儲能餘額' ? (
            <div className="mt-3 space-y-3">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-bold text-slate-800">儲能餘額近 7 天帳本（MWh）</p>
                <div className="mt-2 overflow-x-auto rounded border border-slate-200">
                  <table className="min-w-[720px] text-xs">
                    <thead className="bg-slate-100 text-slate-700">
                      <tr>
                        <th className="px-2 py-1 text-left">日期</th>
                        <th className="px-2 py-1 text-right">期初餘額</th>
                        <th className="px-2 py-1 text-right">當日充入</th>
                        <th className="px-2 py-1 text-right">當日放電</th>
                        <th className="px-2 py-1 text-right">期末餘額</th>
                        <th className="px-2 py-1 text-center">有效</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storageLedgerRows.map((row) => (
                        <tr key={row.date} className="border-t border-slate-200 bg-white">
                          <td className="px-2 py-1 font-bold">{row.date}</td>
                          <td className="px-2 py-1 text-right">{row.openingMWh}</td>
                          <td className="px-2 py-1 text-right text-indigo-700">+{row.chargeMWh}</td>
                          <td className="px-2 py-1 text-right text-orange-700">-{row.dischargeMWh}</td>
                          <td className="px-2 py-1 text-right font-black">{row.closingMWh}</td>
                          <td className="px-2 py-1 text-center">{row.isValid ? '是' : '否'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">有效天數</p>
                  <p className="mt-1 text-2xl font-black text-emerald-700">{storageSummary.validDays} 天</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-500">總電量（7 日期末合計）</p>
                  <p className="mt-1 text-2xl font-black text-indigo-700">{storageSummary.totalClosingMWh} MWh</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm font-semibold text-slate-600">
              請點選圖上節點（發電端、合約數量、用電端、成功匹配量、儲能、儲能餘額）檢視對應明細。
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
