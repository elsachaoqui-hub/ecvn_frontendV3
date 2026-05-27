import type { Agent, AssetItem } from '@/data/agentAggregation';

export const AMI_LAG_HOURS = 6;
export const SLOTS_PER_DAY = 96;
export const SLOT_MINUTES = 15;
const SLOT_HOURS = SLOT_MINUTES / 60;

export type MeterKind = 'generation' | 'load';

export type LoadProfile = 'fab' | 'office' | 'industrial';

export type MeterDetail = {
  rowKey: string;
  meterNo: string;
  siteName: string;
  no: string;
  systemKwh: number;
  /** 15 分鐘區間代表時刻，例 13:15 */
  intervalLabel: string;
  intervalAt: Date;
  /** 資料更新進入本系統的時間 */
  ingestedAt: Date;
  /** 區間「時間」與當下之差（小時）；歷史日為 null */
  lagHours: number | null;
  /** 此表目前已入本系統之最新 15 分鐘區間索引（0–95） */
  latestSlot: number;
  agentName?: string;
  extra?: string;
};

export type DailyPoint = {
  hour: number;
  label: string;
  actual: number | null;
  reference: number;
  /** 該小時已入系統之表號數 */
  metersInSystem: number;
  meterTotal: number;
};

export type IngestionStatus = {
  lastBatchAt: Date;
  lagHours: number;
  genReceived: number;
  genTotal: number;
  loadReceived: number;
  loadTotal: number;
  pipeline: 'normal' | 'delayed';
};

type MeterIngestProfile = {
  latestSlot: number;
  intervalAt: Date;
  ingestedAt: Date;
  lagHours: number | null;
};

function hashToUnit(key: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967295;
}

function roundKwh(v: number): number {
  return Math.round(v * 10) / 10;
}

function meterSeed(
  asset: AssetItem,
  kind: MeterKind,
  viewDate: string,
  options?: { agentId?: number }
): string {
  const meterNo = asset.meterNo ?? asset.no;
  const agentPrefix = options?.agentId != null ? `${options.agentId}:` : '';
  return `${agentPrefix}${meterNo}:${kind}:${viewDate}`;
}

function slotSeed(asset: AssetItem, kind: MeterKind, viewDate: string, slot: number): string {
  const meterNo = asset.meterNo ?? asset.no;
  return `${meterNo}:${kind}:${viewDate}:${slot}`;
}

function slotHourFraction(slot: number): number {
  return (slot * SLOT_MINUTES) / 60;
}

function isHolidayForDate(viewDate: string): boolean {
  return isWeekend(parseLocalDate(viewDate));
}

/** 用電型態：晶圓廠／數據中心為 24h 基載；市府為辦公；其餘為工廠班別型 */
export function inferLoadProfile(asset: AssetItem): LoadProfile {
  if (/總部|晶圓|數據中心/.test(asset.name)) return 'fab';
  if (/市府|大樓/.test(asset.name)) return 'office';
  return 'industrial';
}

/** 發電容量因子（0–1），依 PV / WIND 與時段 */
function generationCapacityFactor(asset: AssetItem, slot: number, holiday: boolean): number {
  const hour = slotHourFraction(slot);
  const type = asset.renewableType ?? 'PV';
  const meterKey = asset.meterNo ?? asset.no;

  if (type === 'PV') {
    const start = holiday ? 7 : 6;
    const end = holiday ? 17 : 18;
    if (hour < start || hour >= end) return 0;
    const daylight = Math.sin(((hour - start) / (end - start)) * Math.PI);
    const peakBias = 0.9 + hashToUnit(`${meterKey}:pvpeak`, 1) * 0.08;
    return daylight * peakBias;
  }

  const base = holiday ? 0.3 : 0.36;
  const diurnal =
    0.1 * Math.sin(((hour - 10) / 11) * Math.PI) + 0.06 * Math.cos(((hour - 3) / 24) * 2 * Math.PI);
  const gust = (hashToUnit(`${meterKey}:wind:${slot}`, 2) - 0.5) * 0.14;
  return Math.max(0.06, Math.min(0.95, base + diurnal + gust));
}

/** 用電容量因子（0–1） */
function loadCapacityFactor(asset: AssetItem, slot: number, holiday: boolean): number {
  const hour = slotHourFraction(slot);
  const meterKey = asset.meterNo ?? asset.no;
  const profile = inferLoadProfile(asset);

  if (profile === 'fab') {
    const base = 0.8;
    const ripple = 0.035 * Math.sin(((hour - 6) / 24) * 2 * Math.PI);
    const jitter = (hashToUnit(`${meterKey}:fab:${slot}`, 3) - 0.5) * 0.025;
    return Math.max(0.68, Math.min(0.9, base + ripple + jitter));
  }

  if (profile === 'office') {
    if (holiday) {
      return hour >= 9 && hour < 16 ? 0.22 + hashToUnit(`${meterKey}:off:${slot}`, 4) * 0.06 : 0.06;
    }
    if (hour < 7 || hour >= 20) return 0.05 + hashToUnit(`${meterKey}:off:${slot}`, 4) * 0.03;
    if (hour >= 8 && hour < 18) return 0.42 + hashToUnit(`${meterKey}:off:${slot}`, 4) * 0.12;
    return 0.15;
  }

  if (holiday) {
    return hour >= 8 && hour < 17 ? 0.28 + hashToUnit(`${meterKey}:ind:${slot}`, 5) * 0.08 : 0.1;
  }
  const morning = hour >= 7 && hour < 12 ? 0.22 : 0;
  const afternoon = hour >= 13 && hour < 18 ? 0.2 : 0;
  const night = hour < 6 || hour >= 22 ? 0.08 : 0.14;
  return Math.min(0.88, night + morning + afternoon + hashToUnit(`${meterKey}:ind:${slot}`, 5) * 0.06);
}

function slotCapacityFactor(asset: AssetItem, kind: MeterKind, slot: number, holiday: boolean): number {
  return kind === 'generation'
    ? generationCapacityFactor(asset, slot, holiday)
    : loadCapacityFactor(asset, slot, holiday);
}

/** 參考形態：各資產理想區間電量（無量測雜訊） */
export function buildSlotReferenceKwh(
  asset: AssetItem,
  kind: MeterKind,
  viewDate: string,
  slot: number
): number {
  const holiday = isHolidayForDate(viewDate);
  const cf = slotCapacityFactor(asset, kind, slot, holiday);
  return roundKwh(asset.capacityKw * cf * SLOT_HOURS);
}

/** 配電串接至本系統的額外延遲（小時），各表不同 */
function distributionToSystemLagHours(seed: string): number {
  return Math.round((0.25 + hashToUnit(`${seed}:syslag`, 5) * 2.25) * 10) / 10;
}

/** AMI 收進配電系統的延遲（小時），平均約 6 小時、各表快慢不同 */
function amiToDistributionLagHours(seed: string, refreshSeq: number): number {
  const jitter = hashToUnit(`${seed}:amilag`, 1) * 4 - 2;
  const catchUp = Math.min(refreshSeq, 10) * (0.08 + hashToUnit(`${seed}:catchup`, refreshSeq) * 0.12);
  return Math.round((AMI_LAG_HOURS + jitter - catchUp) * 10) / 10;
}

function cutoffTimeToSlot(cutoff: Date, viewDate: string): number {
  const dayStart = parseLocalDate(viewDate);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  if (cutoff < dayStart) return -1;
  const clamped = cutoff >= dayEnd ? new Date(dayEnd.getTime() - SLOT_MINUTES * 60 * 1000) : cutoff;
  const minutes = clamped.getHours() * 60 + clamped.getMinutes();
  return Math.min(SLOTS_PER_DAY - 1, Math.floor(minutes / SLOT_MINUTES));
}

function resolveMeterIngest(
  asset: AssetItem,
  kind: MeterKind,
  viewDate: string,
  isViewingToday: boolean,
  now: Date,
  refreshSeq: number,
  options?: { agentId?: number }
): MeterIngestProfile {
  const seed = meterSeed(asset, kind, viewDate, options);

  if (!isViewingToday) {
    const slot = SLOTS_PER_DAY - 1;
    const intervalAt = slotToDate(viewDate, slot);
    const ingestedAt = new Date(intervalAt);
    ingestedAt.setMinutes(ingestedAt.getMinutes() + 45);
    return { latestSlot: slot, intervalAt, ingestedAt, lagHours: null };
  }

  const amiLagH = amiToDistributionLagHours(seed, refreshSeq);
  const systemLagH = distributionToSystemLagHours(seed);
  const totalLagMs = (amiLagH + systemLagH) * 60 * 60 * 1000;
  const cutoff = new Date(now.getTime() - totalLagMs);
  const latestSlot = cutoffTimeToSlot(cutoff, viewDate);

  if (latestSlot < 0) {
    return {
      latestSlot: -1,
      intervalAt: parseLocalDate(viewDate),
      ingestedAt: now,
      lagHours: null,
    };
  }

  const intervalAt = slotToDate(viewDate, latestSlot);
  const ingestedAt = new Date(intervalAt.getTime() + (amiLagH + systemLagH) * 60 * 60 * 1000);
  const lagHours = Math.round(((now.getTime() - intervalAt.getTime()) / (60 * 60 * 1000)) * 10) / 10;

  return { latestSlot, intervalAt, ingestedAt, lagHours };
}

export function getMeterLatestSlot(
  asset: AssetItem,
  kind: MeterKind,
  viewDate: string,
  isViewingToday: boolean,
  now: Date,
  refreshSeq: number,
  options?: { agentId?: number }
): number {
  return resolveMeterIngest(asset, kind, viewDate, isViewingToday, now, refreshSeq, options).latestSlot;
}

export function toLocalDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatDateTime(d: Date): string {
  return d.toLocaleString('zh-TW', { hour12: false, dateStyle: 'short', timeStyle: 'short' });
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString('zh-TW', { hour: 'numeric', minute: '2-digit', hour12: true });
}

export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

export function slotToDate(viewDate: string, slot: number): Date {
  const d = parseLocalDate(viewDate);
  const totalMin = slot * SLOT_MINUTES;
  d.setHours(Math.floor(totalMin / 60), totalMin % 60, 0, 0);
  return d;
}

export function slotLabel(slot: number): string {
  const totalMin = slot * SLOT_MINUTES;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 整點區間索引（例 02:00 → slot 8） */
export function hourToOnTheHourSlot(hour: number): number {
  return hour * 4;
}

/**
 * 模擬 15 分鐘區間電量（kWh）。
 * 種子僅含表號／端別／日期／區間，與 refreshSeq 無關，確保趨勢圖、明細、CSV 一致。
 */
export function buildSlotKwh(
  asset: AssetItem,
  kind: MeterKind,
  viewDate: string,
  slot: number,
  _refreshSeq = 0
): number {
  const holiday = isHolidayForDate(viewDate);
  const cf = slotCapacityFactor(asset, kind, slot, holiday);
  const seed = slotSeed(asset, kind, viewDate, slot);
  const noise = 0.97 + hashToUnit(`${seed}:noise`) * 0.06;
  return roundKwh(asset.capacityKw * cf * SLOT_HOURS * noise);
}

/** 代理人旗下所有發電或用電 AMI 表於同一 15 分鐘區間之加總 kWh（與 2.3 模擬一致） */
export function sumAgentSlotKwh(agent: Agent, kind: MeterKind, viewDate: string, slot: number): number {
  const assets = kind === 'generation' ? agent.genList : agent.loadList;
  if (assets.length === 0) return 0;
  return roundKwh(assets.reduce((sum, asset) => sum + buildSlotKwh(asset, kind, viewDate, slot), 0));
}

export function kwhToMwh(kwh: number): number {
  return Math.round((kwh / 1000) * 10) / 10;
}

export function buildMeterDetail(
  asset: AssetItem,
  kind: MeterKind,
  viewDate: string,
  isViewingToday: boolean,
  now: Date,
  refreshSeq: number,
  options?: { agentId?: number; agentName?: string }
): MeterDetail {
  const meterNo = asset.meterNo ?? asset.no;
  const ingest = resolveMeterIngest(asset, kind, viewDate, isViewingToday, now, refreshSeq, options);
  const intervalLabel = ingest.latestSlot >= 0 ? slotLabel(ingest.latestSlot) : '—';

  const systemKwh =
    ingest.latestSlot < 0 ? 0 : buildSlotKwh(asset, kind, viewDate, ingest.latestSlot, refreshSeq);

  return {
    rowKey: options?.agentId != null ? `${options.agentId}:${meterNo}` : meterNo,
    meterNo,
    siteName: asset.name,
    no: asset.no,
    systemKwh,
    intervalLabel,
    intervalAt: ingest.intervalAt,
    ingestedAt: ingest.ingestedAt,
    lagHours: ingest.lagHours,
    latestSlot: ingest.latestSlot,
    agentName: options?.agentName,
    extra:
      kind === 'generation'
        ? (asset.renewableType ?? 'PV')
        : (asset.voltageLevel ?? '—'),
  };
}

/** 加總多表於同一 15 分鐘區間之已入系統電量（與 CSV 整點列對齊） */
export function sumSlotKwhInSystem(
  kind: MeterKind,
  assets: AssetItem[],
  viewDate: string,
  slot: number,
  isViewingToday: boolean,
  now: Date,
  refreshSeq: number,
  options?: { agentIdForAsset?: (asset: AssetItem) => number | undefined }
): { total: number; metersInSystem: number; meterTotal: number } {
  let total = 0;
  let metersInSystem = 0;
  const meterTotal = assets.length;

  for (const asset of assets) {
    const agentId = options?.agentIdForAsset?.(asset);
    const latestSlot = getMeterLatestSlot(
      asset,
      kind,
      viewDate,
      isViewingToday,
      now,
      refreshSeq,
      agentId != null ? { agentId } : undefined
    );
    if (latestSlot < slot) continue;

    metersInSystem += 1;
    total += buildSlotKwh(asset, kind, viewDate, slot, refreshSeq);
  }

  return { total: roundKwh(total), metersInSystem, meterTotal };
}

/**
 * 趨勢圖：各整點（:00）加總各表已入系統之 15 分鐘區間電量；
 * 參考線為各資產參考形態之堆疊加總（與實際曲線計算方式對齊）。
 */
export function buildDailySeries(
  kind: MeterKind,
  assets: AssetItem[],
  viewDate: string,
  isViewingToday: boolean,
  now: Date,
  refreshSeq: number,
  options?: { agentIdForAsset?: (asset: AssetItem) => number | undefined }
): DailyPoint[] {
  const meterTotal = assets.length;

  return Array.from({ length: 24 }, (_, hour) => {
    const label = `${String(hour).padStart(2, '0')}:00`;
    const slot = hourToOnTheHourSlot(hour);

    let reference = 0;
    for (const asset of assets) {
      reference += buildSlotReferenceKwh(asset, kind, viewDate, slot);
    }
    reference = roundKwh(reference);

    const { total, metersInSystem } = sumSlotKwhInSystem(
      kind,
      assets,
      viewDate,
      slot,
      isViewingToday,
      now,
      refreshSeq,
      options
    );

    const actual =
      metersInSystem > 0 ? total : isViewingToday ? null : total > 0 ? total : null;

    return { hour, label, actual, reference, metersInSystem, meterTotal };
  });
}

export function buildIngestionStatus(genMeters: MeterDetail[], loadMeters: MeterDetail[], now: Date): IngestionStatus {
  const all = [...genMeters, ...loadMeters];
  const withLag = all.filter((m) => m.lagHours !== null);
  const inSystem = all.filter((m) => m.latestSlot >= 0);
  const avgLag = withLag.length
    ? withLag.reduce((s, m) => s + (m.lagHours ?? 0), 0) / withLag.length
    : AMI_LAG_HOURS;
  const lastBatchAt =
    inSystem.length > 0
      ? new Date(Math.max(...inSystem.map((m) => m.ingestedAt.getTime())))
      : new Date(now.getTime() - avgLag * 60 * 60 * 1000);

  const delayedCount = withLag.filter((m) => (m.lagHours ?? 0) > AMI_LAG_HOURS + 1.5).length;

  return {
    lastBatchAt,
    lagHours: Math.round(avgLag * 10) / 10,
    genReceived: genMeters.filter((m) => m.latestSlot >= 0).length,
    genTotal: genMeters.length,
    loadReceived: loadMeters.filter((m) => m.latestSlot >= 0).length,
    loadTotal: loadMeters.length,
    pipeline: delayedCount > all.length * 0.25 || avgLag > AMI_LAG_HOURS + 1.5 ? 'delayed' : 'normal',
  };
}

/** 歷史 CSV：每 15 分鐘一筆；各表依自身入系統進度標示已授權／待入系統 */
export function buildHistoryCsvRows(
  agentName: string,
  assets: AssetItem[],
  kind: MeterKind,
  viewDate: string,
  isViewingToday: boolean,
  now: Date,
  refreshSeq: number,
  authLabel: string,
  pendingLabel: string,
  options?: { agentId?: number }
): (string | number)[][] {
  const rows: (string | number)[][] = [];
  const [y, m, d] = viewDate.split('-').map(Number);
  const dateSlash = `${y}/${m}/${d}`;

  for (const asset of assets) {
    const meterNo = asset.meterNo ?? asset.no;
    const latestSlot = getMeterLatestSlot(
      asset,
      kind,
      viewDate,
      isViewingToday,
      now,
      refreshSeq,
      options?.agentId != null ? { agentId: options.agentId } : undefined
    );

    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const inSystem = slot <= latestSlot && latestSlot >= 0;
      rows.push([
        agentName,
        meterNo,
        asset.name,
        `${dateSlash} ${slotLabel(slot)}`,
        inSystem ? buildSlotKwh(asset, kind, viewDate, slot, refreshSeq) : '',
        inSystem ? authLabel : pendingLabel,
      ]);
    }
  }

  return rows;
}

export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v);
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export { hashToUnit };
