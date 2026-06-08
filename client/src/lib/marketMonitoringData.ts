import { AGENTS, type Agent } from '@/data/agentAggregation';
import {
  SLOTS_PER_DAY,
  kwhToMwh,
  slotLabel,
  sumAgentSlotKwh,
} from '@/lib/amiPowerModel';

export const ALL_AGENTS_ID = '__all__';

export type DateQueryMode = 'range' | 'single' | 'month';

export type DateQueryState = {
  mode: DateQueryMode;
  start: string;
  end: string;
  month: string;
  agentId: string;
};

export function resolveScopedAgents(agentId: string): Agent[] {
  if (agentId === ALL_AGENTS_ID) return AGENTS;
  const id = Number(agentId);
  const one = AGENTS.find((a) => a.id === id);
  return one ? [one] : AGENTS;
}

export function agentFilterLabel(agentId: string): string {
  if (agentId === ALL_AGENTS_ID) return '全部代理人（彙總）';
  return agentName(Number(agentId));
}

export type RealtimeGenAlert = {
  agentId: number;
  site: string;
  kind: string;
  summary: string;
  lastAt: string;
  dateKey: string;
};

export type DeclarationAlert = {
  agentId: number;
  batch: string;
  uploadStatus: string;
  summary: string;
  deadline: string;
  dateKey: string;
};

export type CheckingSummaryRow = {
  agentId: number;
  daily: string;
  monthly: string;
  note: string;
  dateKey: string;
};

export type SettlementAbnormalRow = {
  agentId: number;
  invalidMWh: number;
  deductionMWh: number;
  remark: string;
  dateKey: string;
};

export type StorageBenefitAgentSummary = {
  agentId: number;
  /** 轉供發電量 */
  transferGenKWh: number;
  /** 轉供電量 */
  contractTransferKWh: number;
  /** 儲能移轉電量 */
  storageTransferKWh: number;
  /** 餘電量 = 轉供發電量 − 轉供電量 − 儲能移轉電量 */
  surplusKWh: number;
  contractTransferPct: number;
  storageTransferPct: number;
  surplusPct: number;
  dateKey: string;
};

export type StorageBenefitLoadDetail = {
  agentId: number;
  meterNo: string;
  siteName: string;
  loadNo: string;
  contractTransferKWh: number;
  storageTransferKWh: number;
};

/** @deprecated 改用 StorageBenefitAgentSummary / StorageBenefitLoadDetail */
export type StorageBenefitRow = {
  meterNo: string;
  transferKWh: number;
  storageTransferKWh: number;
  ratioPct: number;
  dateKey: string;
};

export type MarketImbalanceRow = {
  timeLabel: string;
  dateKey: string;
  slotIndex: number | null;
  role: '賣方' | '買方';
  agentId: number;
  commitmentMWh: number;
  settledMWh: number;
  settledLabel: '結算發電量' | '結算用電量';
  imbalanceMWh: number | null;
  hasObligation: boolean;
  note: string;
};

function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function toDateInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toMonthInputValue(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function enumerateDateKeys(query: DateQueryState): string[] {
  if (query.mode === 'single' && query.start) return [query.start];
  if (query.mode === 'month' && query.month) {
    const [y, m] = query.month.split('-').map(Number);
    const last = new Date(y, m, 0).getDate();
    return Array.from({ length: last }, (_, i) => {
      const day = String(i + 1).padStart(2, '0');
      return `${y}-${String(m).padStart(2, '0')}-${day}`;
    });
  }
  if (query.mode === 'range' && query.start && query.end) {
    const out: string[] = [];
    const cur = parseYmd(query.start);
    const end = parseYmd(query.end);
    while (cur <= end) {
      out.push(toDateInputValue(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }
  return [];
}

export function formatQuerySummary(query: DateQueryState): string {
  const keys = enumerateDateKeys(query);
  const agentPart = agentFilterLabel(query.agentId);
  let datePart = '請設定查詢條件';
  if (keys.length > 0) {
    if (query.mode === 'single') datePart = keys[0].replace(/-/g, '/');
    else if (query.mode === 'month') datePart = `${query.month.replace(/-/g, '/')}（共 ${keys.length} 日）`;
    else if (keys.length === 1) datePart = keys[0].replace(/-/g, '/');
    else datePart = `${keys[0].replace(/-/g, '/')} ～ ${keys[keys.length - 1].replace(/-/g, '/')}（${keys.length} 日）`;
  }
  return `${agentPart} · ${datePart}`;
}

const SITE_NAMES = ['太陽能案場 A', '風力案場 B', '屋頂光電 C', '離岸風機 D'];
const ALERT_KINDS = ['通訊逾時', '數值跳變', '量測缺漏', '功率因數異常'];

export function buildRealtimeGenAlerts(dateKeys: string[], agentIdFilter = ALL_AGENTS_ID): RealtimeGenAlert[] {
  const scoped = resolveScopedAgents(agentIdFilter);
  const rows: RealtimeGenAlert[] = [];
  for (const dateKey of dateKeys) {
    const n = dateKeys.length === 1 ? 2 : hashUnit(`${dateKey}:rt:n`) > 0.55 ? 1 : 0;
    for (let i = 0; i < n; i++) {
      const agentId = scoped[(Math.floor(hashUnit(`${dateKey}:rt:a:${i}`) * scoped.length)) % scoped.length].id;
      const hour = 8 + Math.floor(hashUnit(`${dateKey}:rt:h:${i}`) * 10);
      const min = Math.floor(hashUnit(`${dateKey}:rt:m:${i}`) * 4) * 15;
      rows.push({
        agentId,
        site: `${SITE_NAMES[i % SITE_NAMES.length]}（電號 99${String(10000000 + i).slice(-8)}）`,
        kind: ALERT_KINDS[Math.floor(hashUnit(`${dateKey}:rt:k:${i}`) * ALERT_KINDS.length)],
        summary:
          hashUnit(`${dateKey}:rt:s:${i}`) > 0.5
            ? '超過 15 分鐘未收到即時發電量回傳，狀態標記為異常。'
            : '與前一刻度相比變化率超過門檻，需管理者覆核是否為量測異常。',
        lastAt: `${dateKey.replace(/-/g, '/')} ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        dateKey,
      });
    }
  }
  return rows;
}

export function buildDeclarationAlerts(dateKeys: string[], agentIdFilter = ALL_AGENTS_ID): DeclarationAlert[] {
  const scoped = resolveScopedAgents(agentIdFilter);
  const rows: DeclarationAlert[] = [];
  for (const dateKey of dateKeys) {
    if (hashUnit(`${dateKey}:dec`) < 0.35) continue;
    const agentId = scoped[Math.floor(hashUnit(`${dateKey}:dec:a`) * scoped.length)].id;
    const failed = hashUnit(`${dateKey}:dec:f`) > 0.5;
    rows.push({
      agentId,
      batch: `${dateKey.replace(/-/g, '/')} 日內自排程`,
      uploadStatus: failed ? '檔案校驗失敗' : '未於截止前上傳',
      summary: failed
        ? '自排程檔格式／欄位與平台規範不符，需重新提交。'
        : '儲能移轉前應完成之上傳時限已逾，列為待確認。',
      deadline: `${dateKey.replace(/-/g, '/')} ${failed ? '22:00' : '10:00'}`,
      dateKey,
    });
  }
  return rows;
}

export function buildCheckingSummary(dateKeys: string[], agentIdFilter = ALL_AGENTS_ID): CheckingSummaryRow[] {
  const lastKey = dateKeys[dateKeys.length - 1] ?? toDateInputValue();
  return resolveScopedAgents(agentIdFilter).map((agent) => {
    const dailyBad = hashUnit(`${lastKey}:chk:d:${agent.id}`) > 0.62;
    const monthlyBad = hashUnit(`${lastKey}:chk:m:${agent.id}`) > 0.72;
    return {
      agentId: agent.id,
      daily: dailyBad ? `異常：${1 + Math.floor(hashUnit(`${lastKey}:chk:dc:${agent.id}`) * 3)} 筆 15 分鐘區間待釐清` : '正常',
      monthly: monthlyBad ? '異常：帳務沖銷差異' : '正常',
      note: dailyBad && monthlyBad
        ? '日／月檢核均有待處理項，建議優先指派。'
        : dailyBad
          ? '日檢核有未沖銷之灰電提示，月檢核尚未到期。'
          : monthlyBad
            ? '4.2 月檢核偵測移轉量與實體電量不一致，待複核。'
            : `查詢區間 ${dateKeys.length} 日內檢核狀態彙整。`,
      dateKey: lastKey,
    };
  });
}

export function buildSettlementAbnormal(dateKeys: string[], agentIdFilter = ALL_AGENTS_ID): SettlementAbnormalRow[] {
  const scale = Math.max(1, dateKeys.length);
  return resolveScopedAgents(agentIdFilter).map((agent) => {
    const base = hashUnit(`${agent.id}:set:inv:${dateKeys.join(',')}`);
    const invalidMWh = base > 0.55 ? Math.round((base * 18 * scale) * 10) / 10 : 0;
    const deductionMWh =
      invalidMWh > 0 ? Math.round(invalidMWh * (0.55 + hashUnit(`${agent.id}:ded`) * 0.4) * 10) / 10 : 0;
    return {
      agentId: agent.id,
      invalidMWh,
      deductionMWh,
      remark:
        invalidMWh > 0
          ? deductionMWh === invalidMWh
            ? '失效量與扣除量一致'
            : '含失效灰電與重複認列沖銷'
          : '—',
      dateKey: dateKeys[dateKeys.length - 1] ?? toDateInputValue(),
    };
  });
}

const METER_NOS = ['99123456789', '99876543210', '99555111222', '99333444555'];

function pctOf(part: number, total: number): number {
  return total > 0 ? Number(((part / total) * 100).toFixed(1)) : 0;
}

function distributeKwhToLoads(
  loads: Agent['loadList'],
  totalContract: number,
  totalStorage: number,
  agentId: number
): StorageBenefitLoadDetail[] {
  if (loads.length === 0) {
    return [
      {
        agentId,
        meterNo: METER_NOS[agentId % METER_NOS.length],
        siteName: '用電端（示範）',
        loadNo: '—',
        contractTransferKWh: totalContract,
        storageTransferKWh: totalStorage,
      },
    ];
  }

  const weights = loads.map((_, i) => 0.15 + hashUnit(`st:lw:${agentId}:${i}`) * 0.85);
  const sumW = weights.reduce((a, b) => a + b, 0);
  const contractParts = loads.map((_, i) => Math.floor(totalContract * (weights[i] / sumW)));
  const storageParts = loads.map((_, i) => Math.floor(totalStorage * (weights[i] / sumW)));
  contractParts[loads.length - 1] += totalContract - contractParts.reduce((a, b) => a + b, 0);
  storageParts[loads.length - 1] += totalStorage - storageParts.reduce((a, b) => a + b, 0);

  return loads.map((load, i) => ({
    agentId,
    meterNo: load.meterNo ?? load.no,
    siteName: load.name,
    loadNo: load.no,
    contractTransferKWh: contractParts[i],
    storageTransferKWh: storageParts[i],
  }));
}

/** 各代理人儲能移轉效益彙總（轉供發電量、轉供／儲能移轉／餘電及占比） */
export function buildStorageBenefitAgentSummaries(
  dateKeys: string[],
  agentIdFilter = ALL_AGENTS_ID
): StorageBenefitAgentSummary[] {
  const scale = Math.max(1, dateKeys.length);
  const dateKey = dateKeys[dateKeys.length - 1] ?? toDateInputValue();
  const scoped = resolveScopedAgents(agentIdFilter);

  return scoped.map((agent) => {
    const base = hashUnit(`${dateKey}:st:agent:${agent.id}`);
    const transferGenKWh = Math.round((120_000 + base * 80_000) * scale);
    const storageTransferKWh = Math.round(transferGenKWh * (0.18 + hashUnit(`${dateKey}:st:sr:${agent.id}`) * 0.22));
    const contractTransferKWh = Math.round(
      transferGenKWh * (0.42 + hashUnit(`${dateKey}:st:cr:${agent.id}`) * 0.28)
    );
    const cappedContract = Math.min(contractTransferKWh, transferGenKWh - storageTransferKWh);
    const surplusKWh = Math.max(0, transferGenKWh - cappedContract - storageTransferKWh);

    return {
      agentId: agent.id,
      transferGenKWh,
      contractTransferKWh: cappedContract,
      storageTransferKWh,
      surplusKWh,
      contractTransferPct: pctOf(cappedContract, transferGenKWh),
      storageTransferPct: pctOf(storageTransferKWh, transferGenKWh),
      surplusPct: pctOf(surplusKWh, transferGenKWh),
      dateKey,
    };
  });
}

/** 下鑽：指定代理人之用電電號轉供／儲能移轉明細 */
export function buildStorageBenefitLoadDetails(
  dateKeys: string[],
  agentId: number
): StorageBenefitLoadDetail[] {
  const summary = buildStorageBenefitAgentSummaries(dateKeys, String(agentId))[0];
  if (!summary) return [];
  const agent = AGENTS.find((a) => a.id === agentId);
  if (!agent) return [];
  return distributeKwhToLoads(
    agent.loadList,
    summary.contractTransferKWh,
    summary.storageTransferKWh,
    agentId
  );
}

/** @deprecated 改用 buildStorageBenefitAgentSummaries */
export function buildStorageBenefitRows(dateKeys: string[], agentIdFilter = ALL_AGENTS_ID): StorageBenefitRow[] {
  const scale = Math.max(1, dateKeys.length);
  const dateKey = dateKeys[dateKeys.length - 1] ?? toDateInputValue();
  const scoped = resolveScopedAgents(agentIdFilter);
  const rows: StorageBenefitRow[] = [];

  for (const agent of scoped) {
    const meterNos =
      agent.genList.length > 0
        ? agent.genList.map((g) => g.meterNo ?? g.no)
        : [METER_NOS[agent.id % METER_NOS.length]];
    for (let i = 0; i < meterNos.length; i++) {
      const meterNo = meterNos[i];
      const transferKWh = Math.round((80_000 + hashUnit(`${dateKey}:st:${agent.id}:${i}`) * 60_000) * scale);
      const ratioPct = 28 + hashUnit(`${dateKey}:st:r:${agent.id}:${i}`) * 10;
      const storageTransferKWh = Math.round(transferKWh * (ratioPct / 100));
      rows.push({ meterNo, transferKWh, storageTransferKWh, ratioPct, dateKey });
    }
  }
  return rows;
}

function imbalanceNote(
  role: '賣方' | '買方',
  hasObligation: boolean,
  imbalanceMWh: number | null
): string {
  if (!hasObligation) {
    return role === '賣方'
      ? '結算發電量＞合約轉供量，超額賣量屬場外餘電／躉購範圍，無平衡義務'
      : '結算用電量＜合約轉供量，實際用得比市場承諾少，無平衡義務';
  }
  return role === '賣方'
    ? `結算發電量＜合約轉供量，缺額賣量 ${imbalanceMWh?.toFixed(1)} MWh，具平衡義務（納入預測準確度動態檢核）`
    : `結算用電量＞合約轉供量，超額買量 ${imbalanceMWh?.toFixed(1)} MWh，具平衡義務（納入預測準確度動態檢核）`;
}

/** 申報計畫：合約轉供量 = min(發電量, 用電量)；結算量與 2.3 AMI 區間加總一致 */
function slotMarketVolumes(
  sellerAgent: Agent,
  buyerAgent: Agent,
  dateKey: string,
  slot: number
): { genKwh: number; loadKwh: number; commitmentMWh: number; settledGenMWh: number; settledLoadMWh: number } {
  const genKwh = sumAgentSlotKwh(sellerAgent, 'generation', dateKey, slot);
  const loadKwh = sumAgentSlotKwh(buyerAgent, 'load', dateKey, slot);
  const commitmentMWh = kwhToMwh(Math.min(genKwh, loadKwh));
  return {
    genKwh,
    loadKwh,
    commitmentMWh,
    settledGenMWh: kwhToMwh(genKwh),
    settledLoadMWh: kwhToMwh(loadKwh),
  };
}

function buildRoleImbalanceRow(
  dateKey: string,
  slot: number,
  role: '賣方' | '買方',
  agentId: number,
  commitmentMWh: number,
  settledMWh: number,
  settledLabel: '結算發電量' | '結算用電量'
): MarketImbalanceRow {
  let imbalanceMWh: number | null = null;
  let hasObligation = false;
  if (role === '賣方' && settledMWh < commitmentMWh) {
    imbalanceMWh = Math.round((commitmentMWh - settledMWh) * 10) / 10;
    hasObligation = true;
  }
  if (role === '買方' && settledMWh > commitmentMWh) {
    imbalanceMWh = Math.round((settledMWh - commitmentMWh) * 10) / 10;
    hasObligation = true;
  }

  return {
    timeLabel: `${dateKey.replace(/-/g, '/')} ${slotLabel(slot)}`,
    dateKey,
    slotIndex: slot,
    role,
    agentId,
    commitmentMWh,
    settledMWh,
    settledLabel,
    imbalanceMWh,
    hasObligation,
    note: imbalanceNote(role, hasObligation, imbalanceMWh),
  };
}

function resolveMarketPairs(agentIdFilter: string): { seller: Agent; buyer: Agent }[] {
  const scoped = resolveScopedAgents(agentIdFilter);
  if (scoped.length === 1) {
    return [{ seller: scoped[0], buyer: scoped[0] }];
  }
  const pairs: { seller: Agent; buyer: Agent }[] = [
    { seller: scoped[0], buyer: scoped[1] ?? scoped[0] },
  ];
  for (let i = 2; i < scoped.length; i++) {
    pairs.push({ seller: scoped[i], buyer: scoped[i] });
  }
  return pairs;
}

function imbalanceAgentIds(agentIdFilter: string): number[] {
  const ids = new Set<number>();
  for (const { seller, buyer } of resolveMarketPairs(agentIdFilter)) {
    ids.add(seller.id);
    ids.add(buyer.id);
  }
  return [...ids];
}

/** 單日 15 分鐘明細 */
export function buildImbalanceSlotRows(dateKey: string, agentIdFilter = ALL_AGENTS_ID): MarketImbalanceRow[] {
  const rows: MarketImbalanceRow[] = [];
  for (const { seller, buyer } of resolveMarketPairs(agentIdFilter)) {
    for (let slot = 0; slot < SLOTS_PER_DAY; slot++) {
      const vol = slotMarketVolumes(seller, buyer, dateKey, slot);
      rows.push(
        buildRoleImbalanceRow(
          dateKey,
          slot,
          '賣方',
          seller.id,
          vol.commitmentMWh,
          vol.settledGenMWh,
          '結算發電量',
        ),
        buildRoleImbalanceRow(
          dateKey,
          slot,
          '買方',
          buyer.id,
          vol.commitmentMWh,
          vol.settledLoadMWh,
          '結算用電量',
        ),
      );
    }
  }
  return rows;
}

/** 每日彙總列（點選日期可下鑽至 15 分鐘） */
export function buildImbalanceDailyRows(dateKeys: string[], agentIdFilter = ALL_AGENTS_ID): MarketImbalanceRow[] {
  const rows: MarketImbalanceRow[] = [];
  const agentIds = imbalanceAgentIds(agentIdFilter);
  for (const dateKey of dateKeys) {
    const slotRows = buildImbalanceSlotRows(dateKey, agentIdFilter);
    for (const role of ['賣方', '買方'] as const) {
      for (const agentId of agentIds) {
        const subset = slotRows.filter((r) => r.role === role && r.agentId === agentId);
        if (subset.length === 0) continue;
        const commitmentMWh = Math.round(subset.reduce((s, r) => s + r.commitmentMWh, 0) * 10) / 10;
        const settledMWh = Math.round(subset.reduce((s, r) => s + r.settledMWh, 0) * 10) / 10;
        let imbalanceMWh: number | null = null;
        let hasObligation = false;
        if (role === '賣方' && settledMWh < commitmentMWh) {
          imbalanceMWh = Math.round((commitmentMWh - settledMWh) * 10) / 10;
          hasObligation = true;
        }
        if (role === '買方' && settledMWh > commitmentMWh) {
          imbalanceMWh = Math.round((settledMWh - commitmentMWh) * 10) / 10;
          hasObligation = true;
        }
        rows.push({
          timeLabel: dateKey.replace(/-/g, '/'),
          dateKey,
          slotIndex: null,
          role,
          agentId,
          commitmentMWh,
          settledMWh,
          settledLabel: role === '賣方' ? '結算發電量' : '結算用電量',
          imbalanceMWh,
          hasObligation,
          note: imbalanceNote(role, hasObligation, imbalanceMWh),
        });
      }
    }
  }
  return rows;
}

export function agentName(id: number): string {
  return AGENTS.find((a) => a.id === id)?.name ?? `代理人 #${id}`;
}
