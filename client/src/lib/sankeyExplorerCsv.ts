import dailyCsvRaw from '@/data/sankey_explorer_daily.csv?raw';
import detailCsvRaw from '@/data/sankey_slots_15min_detail.csv?raw';
import flowsCsvRaw from '@/data/sankey_flows_15min.csv?raw';
import assetsCsvRaw from '@/data/sankey_asset_registry.csv?raw';

export type SankeyAssetRow = {
  assetId: string;
  assetType: 'generation' | 'load';
  resourceType: string;
  siteName: string;
  meterNumber: string;
  capacityKw: number;
};

export type SankeyExplorerDailyRow = {
  dateLabel: string;
  generation: number;
  load: number;
  storageIn: number;
  storageOut: number;
  storageBalance: number;
  contractMatched: number;
  totalMatched: number;
};

export type SankeyExplorerQuarterRow = {
  slotIndex: number;
  timeLabel: string;
  generationPlan: number;
  generationActual: number;
  loadPlan: number;
  loadActual: number;
  storagePlan: number;
  storageActual: number;
};

/** 15 分鐘完整列（含 G1-G5、L1-L5、桑基節點） */
export type SankeySlotDetailRow = {
  dateLabel: string;
  timeLabel: string;
  slotIndex: number;
  generationByAssetKw: Record<string, number>;
  generationByAssetKwh: Record<string, number>;
  loadByAssetKw: Record<string, number>;
  loadByAssetKwh: Record<string, number>;
  generationTotalKwh: number;
  loadTotalKwh: number;
  contractTransferKwh: number;
  contractMatchedKwh: number;
  storagePlanKwh: number;
  storageActualKwh: number;
  storageChargeKwh: number;
  storageDischargeKwh: number;
  prevStorageBalanceKwh: number;
  endStorageBalanceKwh: number;
  transferSuccessKwh: number;
  surplusKwh: number;
  sankeyNodes: Record<string, number>;
};

export type SankeyFlowRow = {
  dateLabel: string;
  timeLabel: string;
  flowId: string;
  sourceNode: string;
  sourceAssetId: string;
  targetNode: string;
  targetAssetId: string;
  flowKwh: number;
  flowType: string;
  notes: string;
};

export type SankeyExplorerDataset = {
  assets: SankeyAssetRow[];
  dailyRows: SankeyExplorerDailyRow[];
  quarterRowsByDate: Map<string, SankeyExplorerQuarterRow[]>;
  slotDetailByDate: Map<string, SankeySlotDetailRow[]>;
  flowsByDateTime: Map<string, SankeyFlowRow[]>;
};

const GEN_IDS = ['G1', 'G2', 'G3', 'G4', 'G5'] as const;
const LOAD_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;

function parseCsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

function num(v: string, field: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid number for ${field}: ${v}`);
  return n;
}

function parseDailyCsv(text: string): SankeyExplorerDailyRow[] {
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return body.map((cells) => ({
    dateLabel: cells[idx.date],
    generation: num(cells[idx.generation_kwh], 'generation_kwh'),
    load: num(cells[idx.load_kwh], 'load_kwh'),
    storageIn: num(cells[idx.storage_in_kwh], 'storage_in_kwh'),
    storageOut: num(cells[idx.storage_out_kwh], 'storage_out_kwh'),
    storageBalance: num(cells[idx.storage_balance_kwh], 'storage_balance_kwh'),
    contractMatched: num(cells[idx.contract_matched_kwh], 'contract_matched_kwh'),
    totalMatched: num(cells[idx.total_matched_kwh], 'total_matched_kwh'),
  }));
}

function parseAssetsCsv(text: string): SankeyAssetRow[] {
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return body.map((cells) => ({
    assetId: cells[idx.asset_id],
    assetType: cells[idx.asset_type] as SankeyAssetRow['assetType'],
    resourceType: cells[idx.resource_type],
    siteName: (cells[idx.site_name] ?? '').trim(),
    meterNumber: (cells[idx.meter_number] ?? '').trim(),
    capacityKw: num(cells[idx.capacity_kw], 'capacity_kw'),
  }));
}

/** 電號主檔顯示：G1 · 場站 · 表號 · 資源類型 */
export function formatSankeyAssetLabel(assetId: string): string {
  if (!assetId) return '（節點彙總）';
  const asset = getSankeyAsset(assetId);
  if (!asset) return assetId;
  const meter = asset.meterNumber ? ` · 表號 ${asset.meterNumber}` : '';
  return `${asset.assetId} · ${asset.siteName}${meter}（${asset.resourceType}）`;
}

function parseDetailCsv(text: string): {
  quarterRowsByDate: Map<string, SankeyExplorerQuarterRow[]>;
  slotDetailByDate: Map<string, SankeySlotDetailRow[]>;
} {
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const quarterRowsByDate = new Map<string, SankeyExplorerQuarterRow[]>();
  const slotDetailByDate = new Map<string, SankeySlotDetailRow[]>();

  const nodeKeys = [
    'node_發電端_kwh',
    'node_儲能餘額_kwh',
    'node_合約數量_kwh',
    'node_儲能_kwh',
    'node_用電端_kwh',
    'node_用電端轉移量_kwh',
    'node_成功匹配_kwh',
    'node_儲能存入_kwh',
    'node_未匹配_kwh',
    'node_餘電_kwh',
  ] as const;

  for (const cells of body) {
    const date = cells[idx.date];
    const timeLabel = cells[idx.time_slot];
    const slotIndex = num(cells[idx.slot_index], 'slot_index');

    const generationByAssetKw = Object.fromEntries(GEN_IDS.map((id) => [id, num(cells[idx[`${id}_kw`]], `${id}_kw`)]));
    const generationByAssetKwh = Object.fromEntries(GEN_IDS.map((id) => [id, num(cells[idx[`${id}_kwh`]], `${id}_kwh`)]));
    const loadByAssetKw = Object.fromEntries(LOAD_IDS.map((id) => [id, num(cells[idx[`${id}_kw`]], `${id}_kw`)]));
    const loadByAssetKwh = Object.fromEntries(LOAD_IDS.map((id) => [id, num(cells[idx[`${id}_kwh`]], `${id}_kwh`)]));

    const sankeyNodes: Record<string, number> = {};
    for (const key of nodeKeys) {
      const label = key.replace('node_', '').replace('_kwh', '');
      sankeyNodes[label] = num(cells[idx[key]], key);
    }

    const detail: SankeySlotDetailRow = {
      dateLabel: date,
      timeLabel,
      slotIndex,
      generationByAssetKw,
      generationByAssetKwh,
      loadByAssetKw,
      loadByAssetKwh,
      generationTotalKwh: num(cells[idx.generation_total_kwh], 'generation_total_kwh'),
      loadTotalKwh: num(cells[idx.load_total_kwh], 'load_total_kwh'),
      contractTransferKwh: num(cells[idx.contract_transfer_kwh], 'contract_transfer_kwh'),
      contractMatchedKwh: num(cells[idx.contract_matched_kwh], 'contract_matched_kwh'),
      storagePlanKwh: num(cells[idx.storage_plan_kwh], 'storage_plan_kwh'),
      storageActualKwh: num(cells[idx.storage_actual_kwh], 'storage_actual_kwh'),
      storageChargeKwh: num(cells[idx.storage_charge_kwh], 'storage_charge_kwh'),
      storageDischargeKwh: num(cells[idx.storage_discharge_kwh], 'storage_discharge_kwh'),
      prevStorageBalanceKwh: num(cells[idx.prev_storage_balance_kwh], 'prev_storage_balance_kwh'),
      endStorageBalanceKwh: num(cells[idx.end_storage_balance_kwh], 'end_storage_balance_kwh'),
      transferSuccessKwh: num(cells[idx.transfer_success_kwh], 'transfer_success_kwh'),
      surplusKwh: num(cells[idx.surplus_kwh], 'surplus_kwh'),
      sankeyNodes,
    };

    const quarter: SankeyExplorerQuarterRow = {
      slotIndex,
      timeLabel,
      generationPlan: detail.generationTotalKwh,
      generationActual: detail.generationTotalKwh,
      loadPlan: detail.loadTotalKwh,
      loadActual: detail.loadTotalKwh,
      storagePlan: detail.storagePlanKwh,
      storageActual: detail.storageActualKwh,
    };

    const detailList = slotDetailByDate.get(date) ?? [];
    if (!slotDetailByDate.has(date)) slotDetailByDate.set(date, detailList);
    detailList.push(detail);

    const quarterList = quarterRowsByDate.get(date) ?? [];
    if (!quarterRowsByDate.has(date)) quarterRowsByDate.set(date, quarterList);
    quarterList.push(quarter);
  }

  for (const date of Array.from(quarterRowsByDate.keys())) {
    quarterRowsByDate.get(date)!.sort((a, b) => a.slotIndex - b.slotIndex);
    slotDetailByDate.get(date)!.sort((a, b) => a.slotIndex - b.slotIndex);
  }

  return { quarterRowsByDate, slotDetailByDate };
}

function parseFlowsCsv(text: string): Map<string, SankeyFlowRow[]> {
  const rows = parseCsv(text);
  const [header, ...body] = rows;
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const byKey = new Map<string, SankeyFlowRow[]>();

  for (const cells of body) {
    const dateLabel = cells[idx.date];
    const timeLabel = cells[idx.time_slot];
    const key = `${dateLabel}@${timeLabel}`;
    const row: SankeyFlowRow = {
      dateLabel,
      timeLabel,
      flowId: cells[idx.flow_id],
      sourceNode: cells[idx.source_node],
      sourceAssetId: cells[idx.source_asset_id] ?? '',
      targetNode: cells[idx.target_node],
      targetAssetId: cells[idx.target_asset_id] ?? '',
      flowKwh: num(cells[idx.flow_kwh], 'flow_kwh'),
      flowType: cells[idx.flow_type],
      notes: cells[idx.notes] ?? '',
    };
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(row);
  }
  return byKey;
}

let cached: SankeyExplorerDataset | null = null;

export function loadSankeyExplorerDataset(): SankeyExplorerDataset {
  if (cached) return cached;
  const { quarterRowsByDate, slotDetailByDate } = parseDetailCsv(detailCsvRaw);
  cached = {
    assets: parseAssetsCsv(assetsCsvRaw),
    dailyRows: parseDailyCsv(dailyCsvRaw),
    quarterRowsByDate,
    slotDetailByDate,
    flowsByDateTime: parseFlowsCsv(flowsCsvRaw),
  };
  return cached;
}

export function getSankeyQuarterRowsForDate(dateLabel: string): SankeyExplorerQuarterRow[] {
  return loadSankeyExplorerDataset().quarterRowsByDate.get(dateLabel) ?? [];
}

export function getSankeySlotDetail(dateLabel: string, timeLabel: string): SankeySlotDetailRow | null {
  const ds = loadSankeyExplorerDataset();
  return ds.slotDetailByDate.get(dateLabel)?.find((r) => r.timeLabel === timeLabel) ?? null;
}

export function getSankeyFlows(dateLabel: string, timeLabel: string): SankeyFlowRow[] {
  return loadSankeyExplorerDataset().flowsByDateTime.get(`${dateLabel}@${timeLabel}`) ?? [];
}

export function getSankeyFlowsForNode(dateLabel: string, timeLabel: string, nodeName: string): SankeyFlowRow[] {
  return getSankeyFlows(dateLabel, timeLabel).filter(
    (f) => f.sourceNode === nodeName || f.targetNode === nodeName
  );
}

export function getSankeyAsset(assetId: string): SankeyAssetRow | undefined {
  return loadSankeyExplorerDataset().assets.find((a) => a.assetId === assetId);
}

export function getSankeyAssetsByType(assetType: SankeyAssetRow['assetType']): SankeyAssetRow[] {
  return loadSankeyExplorerDataset().assets.filter((a) => a.assetType === assetType);
}

export type AggregatedFlowRow = {
  sourceNode: string;
  sourceAssetId: string;
  targetNode: string;
  targetAssetId: string;
  flowKwh: number;
  flowType: string;
  slotCount: number;
};

export function getSankeyFlowsForDates(dateLabels: string[]): SankeyFlowRow[] {
  const set = new Set(dateLabels);
  const ds = loadSankeyExplorerDataset();
  const out: SankeyFlowRow[] = [];
  for (const [key, flows] of Array.from(ds.flowsByDateTime.entries())) {
    const date = key.split('@')[0];
    if (set.has(date)) out.push(...flows);
  }
  return out;
}

export function getSankeyFlowsForSlot(dateLabel: string, timeLabel: string): SankeyFlowRow[] {
  return getSankeyFlows(dateLabel, timeLabel);
}

export function aggregateSankeyFlows(flows: SankeyFlowRow[]): AggregatedFlowRow[] {
  const map = new Map<string, AggregatedFlowRow & { slots: Set<string> }>();
  for (const f of flows) {
    const key = `${f.sourceNode}|${f.sourceAssetId}|${f.targetNode}|${f.targetAssetId}|${f.flowType}`;
    const slotKey = `${f.dateLabel}@${f.timeLabel}`;
    const existing = map.get(key);
    if (existing) {
      existing.flowKwh += f.flowKwh;
      existing.slots.add(slotKey);
    } else {
      map.set(key, {
        sourceNode: f.sourceNode,
        sourceAssetId: f.sourceAssetId,
        targetNode: f.targetNode,
        targetAssetId: f.targetAssetId,
        flowKwh: f.flowKwh,
        flowType: f.flowType,
        slotCount: 0,
        slots: new Set([slotKey]),
      });
    }
  }
  return Array.from(map.values())
    .map(({ slots, ...row }) => ({
      ...row,
      flowKwh: Number(row.flowKwh.toFixed(3)),
      slotCount: slots.size,
    }))
    .sort((a, b) => b.flowKwh - a.flowKwh);
}

export function getSankeySlotDetailsForDates(dateLabels: string[]): SankeySlotDetailRow[] {
  const ds = loadSankeyExplorerDataset();
  const set = new Set(dateLabels);
  const out: SankeySlotDetailRow[] = [];
  for (const [date, rows] of Array.from(ds.slotDetailByDate.entries())) {
    if (set.has(date)) out.push(...rows);
  }
  return out;
}

/** 桑基圖連線（節點彙總，不含電號拆分） */
export type SankeyChartLink = {
  source: string;
  target: string;
  value: number;
};

export const SANKEY_CHART_NODES = [
  '發電端',
  '儲能餘額',
  '合約數量',
  '儲能',
  '用電端',
  '成功匹配',
  '儲能存入',
  '未匹配',
  '餘電',
] as const;

const CANONICAL_LINKS: Array<[string, string]> = [
  ['發電端', '合約數量'],
  ['發電端', '儲能'],
  ['發電端', '餘電'],
  ['儲能餘額', '儲能'],
  ['合約數量', '用電端'],
  ['合約數量', '餘電'],
  ['儲能', '用電端'],
  ['儲能', '儲能存入'],
  ['用電端', '成功匹配'],
  ['用電端', '餘電'],
  ['用電端', '未匹配'],
];

/** 依日期清單從 CSV 流向加總桑基圖連線（年／月／日層級共用） */
export function buildSankeyChartFromDates(dateLabels: string[]): SankeyChartLink[] {
  if (dateLabels.length === 0) return [];

  const flows = getSankeyFlowsForDates(dateLabels);
  const linkMap = new Map<string, number>();

  for (const f of flows) {
    const key = `${f.sourceNode}\t${f.targetNode}`;
    linkMap.set(key, (linkMap.get(key) ?? 0) + f.flowKwh);
  }

  const links: SankeyChartLink[] = [];
  for (const [source, target] of CANONICAL_LINKS) {
    const value = Number((linkMap.get(`${source}\t${target}`) ?? 0).toFixed(3));
    if (value > 0.001) links.push({ source, target, value });
  }

  // 保留非標準連線（若未來 CSV 擴充）
  for (const [key, value] of Array.from(linkMap.entries())) {
    const [source, target] = key.split('\t');
    const rounded = Number(value.toFixed(3));
    if (rounded <= 0.001) continue;
    if (CANONICAL_LINKS.some(([s, t]) => s === source && t === target)) continue;
    links.push({ source, target, value: rounded });
  }

  return links;
}

export function summarizeSankeyNodeFlows(links: SankeyChartLink[], nodeName: string) {
  const inFlow = links.filter((l) => l.target === nodeName).reduce((s, l) => s + l.value, 0);
  const outFlow = links.filter((l) => l.source === nodeName).reduce((s, l) => s + l.value, 0);
  return {
    inFlow: Number(inFlow.toFixed(3)),
    outFlow: Number(outFlow.toFixed(3)),
  };
}
