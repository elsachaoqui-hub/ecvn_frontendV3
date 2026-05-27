import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SLOT_COUNT = 96;

const DISCLAIMER =
  '不論採行彈性分配或儲能電能移轉，其分配順序與額度均屬用戶自主管理範疇。若分配後仍有剩餘電量，該損失應由用戶自行承擔；本平台僅負責依據實測數據進行電量核算，不負擔剩餘電量之處置或補償責任。';

/** 示範用電號數量（實務可擴充至數百筆；表格以捲動與搜尋呈現） */
const DEMO_GEN_COUNT = 16;
const DEMO_LOAD_COUNT = 10;

export type ElasticFlow = { genNo: string; loadNo: string; kwh: number };
export type TransferFlow = { loadNo: string; kwh: number };

type TransferLedgerLine = {
  genNo: string;
  storageId: string;
  shiftNote: string;
  kwh: number;
};

type SlotBaseline = {
  genKwh: number[][];
  loadKwh: number[][];
  genPotential: number[];
  physicalOut: number[];
  storageCharged: number[];
  storageTransferCap: number[];
};

function slotLabel(slot: number): string {
  const totalMin = slot * 15;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hash01(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let c = 0; c < seed.length; c++) {
    h = Math.imul(h ^ seed.charCodeAt(c), 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function buildMeterNos(prefix: string, count: number, pad: number) {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(pad, '0')}`);
}

function buildSlotBaseline(settlementDate: string, genNos: string[], loadNos: string[]): SlotBaseline {
  const G = genNos.length;
  const L = loadNos.length;
  const genKwh: number[][] = Array.from({ length: G }, () => Array(SLOT_COUNT).fill(0));
  const loadKwh: number[][] = Array.from({ length: L }, () => Array(SLOT_COUNT).fill(0));
  const genPotential: number[] = [];
  const physicalOut: number[] = [];
  const storageCharged: number[] = [];
  const storageTransferCap: number[] = [];

  for (let s = 0; s < SLOT_COUNT; s++) {
    const totalMin = s * 15;
    const hour = Math.floor(totalMin / 60) % 24;
    const sun = hour >= 6 && hour <= 18 ? Math.sin(((hour - 6) / 12) * Math.PI) : 0;
    let sumG = 0;
    for (let gi = 0; gi < G; gi++) {
      const bias = 0.55 + hash01(`${settlementDate}:g:${genNos[gi]}`, s) * 0.9;
      const piece = (0.12 + sun * 0.55 + hash01(`${settlementDate}:gs`, s + gi * 17)) * bias;
      const v = Math.round(piece * 28 * 10) / 10;
      genKwh[gi][s] = Math.max(0, v);
      sumG += genKwh[gi][s];
    }
    genPotential.push(Math.round(sumG * 10) / 10);

    let sumL = 0;
    for (let li = 0; li < L; li++) {
      const bias = 0.45 + hash01(`${settlementDate}:l:${loadNos[li]}`, s) * 0.85;
      const piece = (0.1 + sun * 0.42 + hash01(`${settlementDate}:ls`, s + li * 19)) * bias;
      const v = Math.round(piece * 22 * 10) / 10;
      loadKwh[li][s] = Math.max(0.05, v);
      sumL += loadKwh[li][s];
    }

    const phys = Math.round((sumG + 1.5 + hash01(`${settlementDate}:po`, s) * 4) * 10) / 10;
    physicalOut.push(phys);
    const stc =
      hour >= 10 && hour <= 15 ? Math.round((2.5 + sun * 5 + hash01(`${settlementDate}:st`, s) * 2) * 10) / 10 : 0;
    storageCharged.push(stc);
    const cap =
      hour >= 18 && hour <= 22
        ? Math.round((4 + hash01(`${settlementDate}:cap`, s) * 7) * 10) / 10
        : Math.round(hash01(`${settlementDate}:cap2`, s) * 4 * 10) / 10;
    storageTransferCap.push(Math.max(0.05, Math.min(cap, sumL * 0.35)));
  }

  return { genKwh, loadKwh, genPotential, physicalOut, storageCharged, storageTransferCap };
}

function emptyFlowsElastic(): ElasticFlow[][] {
  return Array.from({ length: SLOT_COUNT }, () => []);
}

function emptyFlowsTransfer(): TransferFlow[][] {
  return Array.from({ length: SLOT_COUNT }, () => []);
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

/** 由發電剩餘 × 負載需求雙向貪婪，產出示範彈性轉供細項（每格一筆，可再擴充演算法） */
function greedyElasticFlowsForSlot(
  genNos: string[],
  loadNos: string[],
  remG: number[],
  remL: number[]
): ElasticFlow[] {
  const g = remG.map((x) => x);
  const l = remL.map((x) => x);
  const flows: ElasticFlow[] = [];
  for (let gi = 0; gi < genNos.length; gi++) {
    for (let li = 0; li < loadNos.length; li++) {
      const x = round1(Math.min(g[gi], l[li]));
      if (x <= 0) continue;
      flows.push({ genNo: genNos[gi], loadNo: loadNos[li], kwh: x });
      g[gi] = round1(g[gi] - x);
      l[li] = round1(l[li] - x);
    }
  }
  return flows;
}

function synthesizeElasticAllSlots(genNos: string[], loadNos: string[], bl: SlotBaseline): ElasticFlow[][] {
  const out = emptyFlowsElastic();
  for (let s = 0; s < SLOT_COUNT; s++) {
    const remG = genNos.map((_, gi) => bl.genKwh[gi][s]);
    const remL = loadNos.map((_, li) => bl.loadKwh[li][s]);
    out[s] = greedyElasticFlowsForSlot(genNos, loadNos, remG, remL);
  }
  return out;
}

function synthesizeTransferAllSlots(loadNos: string[], bl: SlotBaseline, elastic: ElasticFlow[][]): TransferFlow[][] {
  const out = emptyFlowsTransfer();
  const L = loadNos.length;
  for (let s = 0; s < SLOT_COUNT; s++) {
    const elasticToLoad = Array(L).fill(0);
    for (const f of elastic[s]) {
      const li = loadNos.indexOf(f.loadNo);
      if (li >= 0) elasticToLoad[li] += f.kwh;
    }
    const residual = loadNos.map((_, li) => Math.max(0, round1(bl.loadKwh[li][s] - elasticToLoad[li])));
    const sumR = residual.reduce((a, b) => a + b, 0);
    const cap = bl.storageTransferCap[s];
    if (sumR < 0.01 || cap < 0.01) continue;

    const raw = residual.map((r) => (sumR > 0 ? (r / sumR) * cap : 0));
    const assigned = raw.reduce((a, b) => a + b, 0);
    const scale = assigned > cap + 1e-6 ? cap / Math.max(assigned, 1e-6) : 1;

    for (let li = 0; li < L; li++) {
      const take = round1(Math.min(residual[li], raw[li] * scale));
      if (take <= 0) continue;
      out[s].push({ loadNo: loadNos[li], kwh: take });
    }

    const total = round1(out[s].reduce((a, f) => a + f.kwh, 0));
    if (total > cap + 0.05) {
      const sc = cap / Math.max(total, 1e-6);
      out[s] = out[s].map((f) => ({ ...f, kwh: round1(f.kwh * sc) }));
    }
  }
  return out;
}

function aggregateElasticOut(
  flows: ElasticFlow[][],
  genNos: string[],
  loadNos: string[]
): { fromGen: number[][]; toLoad: number[][]; totalPerSlot: number[] } {
  const G = genNos.length;
  const L = loadNos.length;
  const genIdx = Object.fromEntries(genNos.map((g, i) => [g, i]));
  const loadIdx = Object.fromEntries(loadNos.map((x, i) => [x, i]));
  const fromGen = Array.from({ length: G }, () => Array(SLOT_COUNT).fill(0));
  const toLoad = Array.from({ length: L }, () => Array(SLOT_COUNT).fill(0));
  const totalPerSlot = Array(SLOT_COUNT).fill(0);
  for (let s = 0; s < SLOT_COUNT; s++) {
    const row = flows[s] ?? [];
    for (const f of row) {
      const gi = genIdx[f.genNo];
      const li = loadIdx[f.loadNo];
      if (gi === undefined || li === undefined) continue;
      fromGen[gi][s] = round1(fromGen[gi][s] + f.kwh);
      toLoad[li][s] = round1(toLoad[li][s] + f.kwh);
      totalPerSlot[s] = round1(totalPerSlot[s] + f.kwh);
    }
  }
  return { fromGen, toLoad, totalPerSlot };
}

function aggregateTransfer(flows: TransferFlow[][], loadNos: string[]) {
  const loadIdx = Object.fromEntries(loadNos.map((x, i) => [x, i]));
  const toLoad = Array.from({ length: loadNos.length }, () => Array(SLOT_COUNT).fill(0));
  const totalPerSlot = Array(SLOT_COUNT).fill(0);
  for (let s = 0; s < SLOT_COUNT; s++) {
    const row = flows[s] ?? [];
    for (const f of row) {
      const li = loadIdx[f.loadNo];
      if (li === undefined) continue;
      toLoad[li][s] = round1(toLoad[li][s] + f.kwh);
      totalPerSlot[s] = round1(totalPerSlot[s] + f.kwh);
    }
  }
  return { toLoad, totalPerSlot };
}

type RuleCode = 'R1' | 'R1g' | 'R2a' | 'R2b' | 'R2cap';

type ValidationIssue = {
  id: string;
  rule: RuleCode;
  ruleTitle: string;
  slot: number;
  meter?: string;
  message: string;
  detail: string;
};

function validateAll(
  bl: SlotBaseline,
  genNos: string[],
  loadNos: string[],
  elastic: ElasticFlow[][],
  transfer: TransferFlow[][]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let nid = 0;
  const aggE = aggregateElasticOut(elastic, genNos, loadNos);
  const aggT = aggregateTransfer(transfer, loadNos);

  for (let s = 0; s < SLOT_COUNT; s++) {
    const gen = bl.genPotential[s];
    const charged = bl.storageCharged[s];
    const phys = bl.physicalOut[s];

    if (aggE.totalPerSlot[s] > gen + 0.05) {
      issues.push({
        id: `r1-${s}-${nid++}`,
        rule: 'R1',
        ruleTitle: '規則一：彈性分配合計與物理產量（多發電合計）',
        slot: s,
        message: `時段 ${slotLabel(s)} 彈性轉供合計超過多發電電號實際發電量總和`,
        detail: `彈性合計 ${round1(aggE.totalPerSlot[s])} kWh > 發電合計（供給潛力） ${round1(gen)} kWh。請調整上傳之發電→負載明細或重新產製檔案。`,
      });
    }

    for (let gi = 0; gi < genNos.length; gi++) {
      const outG = aggE.fromGen[gi][s];
      const capG = bl.genKwh[gi][s];
      if (outG > capG + 0.05) {
        issues.push({
          id: `r1g-${s}-${gi}-${nid++}`,
          rule: 'R1g',
          ruleTitle: '規則一：單一發電電號轉出上限',
          slot: s,
          meter: genNos[gi],
          message: `時段 ${slotLabel(s)} 發電電號 ${genNos[gi]} 彈性轉出量超過該電號實際發電量`,
          detail: `轉出合計 ${round1(outG)} kWh > 實際發電 ${round1(capG)} kWh。`,
        });
      }
    }

    const instantElastic = aggE.totalPerSlot[s];
    const tSum = aggT.totalPerSlot[s];
    if (tSum > bl.storageTransferCap[s] + 0.05) {
      issues.push({
        id: `r2cap-${s}-${nid++}`,
        rule: 'R2cap',
        ruleTitle: '電能移轉：可分配量上限',
        slot: s,
        message: `時段 ${slotLabel(s)} 移轉分配合計超過帳本可分配移轉量（供給潛力）`,
        detail: `移轉合計 ${round1(tSum)} kWh > 供給潛力 ${round1(bl.storageTransferCap[s])} kWh。請調整上傳檔或帳本回寫後再試。`,
      });
    }

    if (charged + instantElastic + tSum > phys + 0.05) {
      issues.push({
        id: `r2a-${s}-${nid++}`,
        rule: 'R2a',
        ruleTitle: '規則二：累積轉供限制',
        slot: s,
        message: `時段 ${slotLabel(s)} 儲能充入、即時彈性與移轉分配之和超過案場即時物理產出`,
        detail: `(${round1(charged)} + ${round1(instantElastic)} + ${round1(tSum)}) kWh > 物理產出 ${round1(phys)} kWh。`,
      });
    }

    for (let li = 0; li < loadNos.length; li++) {
      const demand = bl.loadKwh[li][s];
      const el = aggE.toLoad[li][s];
      const tr = aggT.toLoad[li][s];
      const residual = Math.max(0, round1(demand - el));
      if (tr > residual + 0.05) {
        issues.push({
          id: `r2b-${s}-${li}-${nid++}`,
          rule: 'R2b',
          ruleTitle: '規則二：殘載填充（面積檢核）',
          slot: s,
          meter: loadNos[li],
          message: `時段 ${slotLabel(s)} 負載電號 ${loadNos[li]} 儲能移轉分配超過殘餘負載`,
          detail: `移轉 ${round1(tr)} kWh > 殘餘 ${round1(residual)} kWh（負載 ${round1(demand)} − 彈性已供 ${round1(el)}）。`,
        });
      }
    }
  }
  return issues;
}

function parseSlotToken(raw: string): number | null {
  const t = raw.trim();
  if (/^\d+$/.test(t)) {
    const n = Number(t);
    if (n >= 0 && n < SLOT_COUNT) return n;
    return null;
  }
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min % 15 !== 0 || h < 0 || h > 23) return null;
  const idx = h * 4 + min / 15;
  return idx >= 0 && idx < SLOT_COUNT ? idx : null;
}

function parseElasticUpload(
  text: string,
  genNos: string[],
  loadNos: string[]
): { flows: ElasticFlow[][]; errors: string[] } {
  const errors: string[] = [];
  const flows = emptyFlowsElastic();
  const t = text.trim();
  if (!t) {
    errors.push('檔案為空');
    return { flows, errors };
  }
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as {
        flows?: Array<{ slot?: number | string; generationMeter?: string; genNo?: string; loadMeter?: string; loadNo?: string; kwh?: number }>;
      };
      const arr = j.flows;
      if (!Array.isArray(arr)) {
        errors.push('JSON 缺少 flows 陣列');
        return { flows, errors };
      }
      for (let i = 0; i < arr.length; i++) {
        const row = arr[i];
        let slot: number | null = null;
        if (typeof row.slot === 'number' && Number.isFinite(row.slot)) {
          slot = Math.trunc(row.slot);
        } else {
          slot = parseSlotToken(String(row.slot ?? ''));
        }
        const gno = row.generationMeter ?? row.genNo ?? '';
        const lno = row.loadMeter ?? row.loadNo ?? '';
        const kwh = Number(row.kwh);
        if (slot === null || slot < 0 || slot >= SLOT_COUNT) {
          errors.push(`第 ${i + 1} 筆 slot 無效`);
          continue;
        }
        if (!genNos.includes(gno) || !loadNos.includes(lno) || Number.isNaN(kwh) || kwh < 0) {
          errors.push(`第 ${i + 1} 筆 電號或 kwh 無效`);
          continue;
        }
        flows[slot].push({ genNo: gno, loadNo: lno, kwh: round1(kwh) });
      }
    } catch {
      errors.push('JSON 解析失敗');
    }
    return { flows, errors };
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let start = 0;
  if (/slot/i.test(lines[0] ?? '') && /gen/i.test(lines[0] ?? '')) start = 1;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',').map((x) => x.trim());
    if (parts.length < 4) {
      errors.push(`CSV 第 ${i + 1} 行欄位不足`);
      continue;
    }
    const slot = parseSlotToken(parts[0]);
    const gno = parts[1];
    const lno = parts[2];
    const kwh = Number(parts[3]);
    if (slot === null) {
      errors.push(`CSV 第 ${i + 1} 行 slot 無效`);
      continue;
    }
    if (!genNos.includes(gno) || !loadNos.includes(lno) || Number.isNaN(kwh) || kwh < 0) {
      errors.push(`CSV 第 ${i + 1} 行資料無效`);
      continue;
    }
    flows[slot].push({ genNo: gno, loadNo: lno, kwh: round1(kwh) });
  }
  return { flows, errors };
}

function parseTransferUpload(text: string, loadNos: string[]): { flows: TransferFlow[][]; errors: string[] } {
  const errors: string[] = [];
  const flows = emptyFlowsTransfer();
  const t = text.trim();
  if (!t) {
    errors.push('檔案為空');
    return { flows, errors };
  }
  if (t.startsWith('{')) {
    try {
      const j = JSON.parse(t) as {
        flows?: Array<{ slot?: number | string; loadMeter?: string; loadNo?: string; kwh?: number }>;
      };
      const arr = j.flows;
      if (!Array.isArray(arr)) {
        errors.push('JSON 缺少 flows 陣列');
        return { flows, errors };
      }
      for (let i = 0; i < arr.length; i++) {
        const row = arr[i];
        let slot: number | null = null;
        if (typeof row.slot === 'number' && Number.isFinite(row.slot)) {
          slot = Math.trunc(row.slot);
        } else {
          slot = parseSlotToken(String(row.slot ?? ''));
        }
        const lno = row.loadMeter ?? row.loadNo ?? '';
        const kwh = Number(row.kwh);
        if (slot === null || slot < 0 || slot >= SLOT_COUNT) {
          errors.push(`第 ${i + 1} 筆 slot 無效`);
          continue;
        }
        if (!loadNos.includes(lno) || Number.isNaN(kwh) || kwh < 0) {
          errors.push(`第 ${i + 1} 筆 負載電號或 kwh 無效`);
          continue;
        }
        flows[slot].push({ loadNo: lno, kwh: round1(kwh) });
      }
    } catch {
      errors.push('JSON 解析失敗');
    }
    return { flows, errors };
  }
  const lines = t.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let start = 0;
  if (/slot/i.test(lines[0] ?? '') && /load/i.test(lines[0] ?? '')) start = 1;
  for (let i = start; i < lines.length; i++) {
    const parts = lines[i].split(',').map((x) => x.trim());
    if (parts.length < 3) {
      errors.push(`CSV 第 ${i + 1} 行欄位不足`);
      continue;
    }
    const slot = parseSlotToken(parts[0]);
    const lno = parts[1];
    const kwh = Number(parts[2]);
    if (slot === null) {
      errors.push(`CSV 第 ${i + 1} 行 slot 無效`);
      continue;
    }
    if (!loadNos.includes(lno) || Number.isNaN(kwh) || kwh < 0) {
      errors.push(`CSV 第 ${i + 1} 行資料無效`);
      continue;
    }
    flows[slot].push({ loadNo: lno, kwh: round1(kwh) });
  }
  return { flows, errors };
}

function buildLedgerMock(slot: number, genNos: string[], bl: SlotBaseline): TransferLedgerLine[] {
  const cap = bl.storageTransferCap[slot];
  const g0 = genNos[0] ?? 'GEN0001';
  const g1 = genNos[1] ?? 'GEN0002';
  return [
    { genNo: g0, storageId: 'ESS-調節C-01', shiftNote: '日間充→夜間放', kwh: round1(cap * 0.42) },
    { genNo: g1, storageId: 'ESS-調節C-01', shiftNote: '日間充→夜間放', kwh: round1(cap * 0.28) },
    { genNo: g0, storageId: 'ESS-調節C-02', shiftNote: '同案場移轉', kwh: round1(cap * 0.2) },
  ];
}

function fmtNow() {
  try {
    return new Date().toLocaleString('zh-TW', { hour12: false, dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DashboardMvrnAllocationSelfDetailPage() {
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [planGroup, setPlanGroup] = useState('PG-2026-001');

  const genNos = useMemo(() => buildMeterNos('GEN', DEMO_GEN_COUNT, 4), []);
  const loadNos = useMemo(() => buildMeterNos('LOAD', DEMO_LOAD_COUNT, 4), []);

  const bl = useMemo(() => buildSlotBaseline(settlementDate, genNos, loadNos), [settlementDate, genNos, loadNos]);

  const [elasticFlows, setElasticFlows] = useState<ElasticFlow[][]>(() => emptyFlowsElastic());
  const [transferFlows, setTransferFlows] = useState<TransferFlow[][]>(() => emptyFlowsTransfer());
  const [elasticDraftAt, setElasticDraftAt] = useState<string | null>(null);
  const [transferDraftAt, setTransferDraftAt] = useState<string | null>(null);
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[] | null>(null);

  const [selectedElasticSlot, setSelectedElasticSlot] = useState<number | null>(null);
  const [selectedTransferSlot, setSelectedTransferSlot] = useState<number | null>(null);
  const [flowSearch, setFlowSearch] = useState('');

  useEffect(() => {
    setElasticFlows(emptyFlowsElastic());
    setTransferFlows(emptyFlowsTransfer());
    setElasticDraftAt(null);
    setTransferDraftAt(null);
    setValidationIssues(null);
    setSelectedElasticSlot(null);
    setSelectedTransferSlot(null);
  }, [settlementDate, genNos, loadNos]);

  const aggElastic = useMemo(() => aggregateElasticOut(elasticFlows, genNos, loadNos), [elasticFlows, genNos, loadNos]);
  const aggTransfer = useMemo(() => aggregateTransfer(transferFlows, loadNos), [transferFlows, loadNos]);

  const onElasticFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const text = await file.text();
      const { flows, errors } = parseElasticUpload(text, genNos, loadNos);
      if (errors.length && flows.every((x) => x.length === 0)) {
        toast.error('彈性分配檔解析失敗', { description: errors.slice(0, 5).join('；') });
        return;
      }
      setElasticFlows(flows);
      setElasticDraftAt(fmtNow());
      setValidationIssues(null);
      toast.success('彈性分配已上傳並暫存', {
        description: errors.length ? `已載入，另有 ${errors.length} 筆列警告可於主控台檢視` : `共 ${flows.reduce((n, a) => n + a.length, 0)} 筆明細`,
      });
    },
    [genNos, loadNos]
  );

  const onTransferFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const text = await file.text();
      const { flows, errors } = parseTransferUpload(text, loadNos);
      if (errors.length && flows.every((x) => x.length === 0)) {
        toast.error('電能移轉檔解析失敗', { description: errors.slice(0, 5).join('；') });
        return;
      }
      setTransferFlows(flows);
      setTransferDraftAt(fmtNow());
      setValidationIssues(null);
      toast.success('電能移轉已上傳並暫存', {
        description: errors.length ? `已載入，另有 ${errors.length} 筆列警告` : `共 ${flows.reduce((n, a) => n + a.length, 0)} 筆明細`,
      });
    },
    [loadNos]
  );

  const runSubmitValidation = () => {
    const issues = validateAll(bl, genNos, loadNos, elasticFlows, transferFlows);
    setValidationIssues(issues);
    if (issues.length === 0) {
      toast.success('檢核通過', { description: '合併彈性分配與電能移轉之每 15 分鐘資料符合規則一、規則二。' });
    } else {
      toast.error('檢核未通過', { description: `共 ${issues.length} 筆待修正，請調整上傳檔或示範資料後再試。` });
    }
  };

  const downloadElasticTemplate = () => {
    const header = 'slot,generation_meter,load_meter,kwh';
    const lines = [header];
    lines.push(`0,${genNos[0]},${loadNos[0]},1.2`);
    lines.push(`0,${genNos[1]},${loadNos[1]},0.8`);
    downloadText(`mvrn_elastic_template_${settlementDate}.csv`, lines.join('\n'));
  };

  const downloadTransferTemplate = () => {
    const header = 'slot,load_meter,kwh';
    const lines = [header];
    lines.push(`18,${loadNos[0]},0.5`);
    lines.push(`18,${loadNos[2]},0.3`);
    downloadText(`mvrn_transfer_template_${settlementDate}.csv`, lines.join('\n'));
  };

  const fillDemoElastic = () => {
    const flows = synthesizeElasticAllSlots(genNos, loadNos, bl);
    setElasticFlows(flows);
    setElasticDraftAt(fmtNow());
    setValidationIssues(null);
    toast.info('已填入示範彈性分配', { description: '依本畫面多發電／多負載試算產生明細並暫存。' });
  };

  const fillDemoTransfer = () => {
    const flows = synthesizeTransferAllSlots(loadNos, bl, elasticFlows);
    setTransferFlows(flows);
    setTransferDraftAt(fmtNow());
    setValidationIssues(null);
    toast.info('已填入示範電能移轉', { description: '依帳本可分配量與殘餘負載試算並暫存。' });
  };

  const filteredElasticDetail = useMemo(() => {
    if (selectedElasticSlot === null) return [];
    const q = flowSearch.trim().toLowerCase();
    const list = elasticFlows[selectedElasticSlot] ?? [];
    if (!q) return list;
    return list.filter(
      (f) => (f.genNo ?? '').toLowerCase().includes(q) || (f.loadNo ?? '').toLowerCase().includes(q)
    );
  }, [elasticFlows, selectedElasticSlot, flowSearch]);

  const sectionShell = 'rounded-2xl border border-slate-300 bg-white p-5 shadow-sm';

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      <section className={sectionShell}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">2.5.1 自行分配明細版</h3>
            <p className="mt-2 max-w-4xl text-sm font-semibold text-slate-600 leading-relaxed">
              計畫群組可含大量發電電號與負載電號。請以檔案上傳「彈性分配」與「電能移轉」之自行分配明細（發電→負載／移轉→負載），上傳成功即暫存；再於「送出與自動檢核」執行合併檢核。
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-200 pt-4">
          <div>
            <Label className="text-xs font-bold text-slate-600">結算日</Label>
            <Input type="date" value={settlementDate} onChange={(e) => setSettlementDate(e.target.value)} className="mt-1 h-9 w-44 bg-white" />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-600">計畫群組</Label>
            <Input value={planGroup} onChange={(e) => setPlanGroup(e.target.value)} className="mt-1 h-9 w-56 bg-white" />
          </div>
          <div className="flex flex-col justify-end text-xs text-slate-500">
            <span>
              示範電號：<span className="font-mono text-slate-700">{DEMO_GEN_COUNT}</span> 發電／
              <span className="font-mono text-slate-700">{DEMO_LOAD_COUNT}</span> 負載（實務可擴充至數百筆）
            </span>
          </div>
        </div>
      </section>

      <Alert className="rounded-xl border border-slate-200 bg-slate-50 text-slate-900">
        <i className="fas fa-circle-info text-slate-600" />
        <AlertTitle className="text-slate-900">流程說明</AlertTitle>
        <AlertDescription className="text-slate-700 leading-relaxed">
          建議先下載 CSV 範本，依轉直供結算與帳本資料填寫後上傳。兩份檔案皆上傳成功後，僅需至「送出與自動檢核」分頁按一次送檢。若需快速瀏覽介面，可使用「示範一鍵填入」產生符合本畫面電號之暫存資料。
        </AlertDescription>
      </Alert>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <p className="font-bold text-amber-900">
          <i className="fas fa-triangle-exclamation mr-2" />
          分配注意事項
        </p>
        <p className="mt-1 leading-relaxed">{DISCLAIMER}</p>
      </div>

      <Tabs defaultValue="elastic" className="w-full gap-4">
        <TabsList className="grid h-auto w-full max-w-3xl grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1">
          <TabsTrigger
            value="elastic"
            className="rounded-lg py-2.5 text-sm font-bold data-[state=active]:border data-[state=active]:border-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            彈性分配作業
          </TabsTrigger>
          <TabsTrigger
            value="transfer"
            className="rounded-lg py-2.5 text-sm font-bold data-[state=active]:border data-[state=active]:border-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            電能移轉作業
          </TabsTrigger>
          <TabsTrigger
            value="submit"
            className="rounded-lg py-2.5 text-sm font-bold data-[state=active]:border data-[state=active]:border-slate-300 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm"
          >
            送出與自動檢核
          </TabsTrigger>
        </TabsList>

        <TabsContent value="elastic" className="mt-4 space-y-4">
          <section className={sectionShell}>
            <h4 className="text-base font-bold text-slate-900">一鍵上傳彈性分配結果（發電電號 → 負載電號 明細）</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              支援 CSV（欄位：slot, generation_meter, load_meter, kwh）或 JSON（flows 陣列）。slot 可用 0–95 或 HH:mm（15
              分鐘刻度）。電號須與本計畫群組示範清單一致；正式環境由後端驗證計畫成員。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100">
                <i className="fas fa-file-arrow-up" />
                選擇檔案並上傳暫存
                <input type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => onElasticFile(e.target.files?.[0] ?? null)} />
              </label>
              <Button type="button" variant="outline" className="border-slate-300 bg-white" onClick={downloadElasticTemplate}>
                <i className="fas fa-download mr-2" />
                下載 CSV 範本
              </Button>
              <Button type="button" variant="secondary" onClick={fillDemoElastic}>
                示範一鍵填入（暫存）
              </Button>
              {elasticDraftAt ? (
                <Badge className="border border-emerald-300 bg-emerald-50 text-emerald-900">已暫存 · {elasticDraftAt}</Badge>
              ) : (
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  尚未暫存
                </Badge>
              )}
            </div>
          </section>

          <section className={sectionShell}>
            <h4 className="text-base font-bold text-slate-900">每 15 分鐘總覽（點列可檢視發電合計與轉供矩陣）</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              「發電合計」為多發電電號實際發電量總和；點選列後於下方檢視各發電電號分量與發電→負載明細（預設收合，點列展開）。
            </p>
            <div className="mt-3 max-h-[min(480px,55vh)] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[720px] text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold">時段</th>
                    <th className="px-2 py-2 text-right font-bold">發電合計（供給潛力）</th>
                    <th className="px-2 py-2 text-right font-bold">彈性已分配</th>
                    <th className="px-2 py-2 text-right font-bold">負載需求合計</th>
                    <th className="px-2 py-2 text-center font-bold">明細</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: SLOT_COUNT }, (_, s) => (
                    <tr
                      key={s}
                      onClick={() => {
                        setSelectedElasticSlot(s);
                        setFlowSearch('');
                      }}
                      className={`cursor-pointer border-t border-slate-200 ${
                        selectedElasticSlot === s ? 'bg-amber-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-2 py-1.5 font-mono font-bold text-slate-800">{slotLabel(s)}</td>
                      <td className="px-2 py-1.5 text-right font-black text-slate-900">{bl.genPotential[s]}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-blue-800">{aggElastic.totalPerSlot[s]}</td>
                      <td className="px-2 py-1.5 text-right text-slate-700">
                        {round1(loadNos.reduce((sum, _, li) => sum + bl.loadKwh[li][s], 0))}
                      </td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{elasticFlows[s].length} 筆</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedElasticSlot !== null ? (
              <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">
                    時段 <span className="font-mono text-blue-800">{slotLabel(selectedElasticSlot)}</span> 明細
                  </p>
                  <Button type="button" variant="ghost" size="sm" className="text-slate-600" onClick={() => setSelectedElasticSlot(null)}>
                    收合
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-600">發電電號實際發電量（本 15 分鐘）</p>
                  <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-2 py-1 text-left">發電電號</th>
                          <th className="px-2 py-1 text-right">實際發電</th>
                          <th className="px-2 py-1 text-right">本時段彈性轉出合計</th>
                        </tr>
                      </thead>
                      <tbody>
                        {genNos.map((g, gi) => (
                          <tr key={g} className="border-t border-slate-200">
                            <td className="px-2 py-1 font-mono font-semibold">{g}</td>
                            <td className="px-2 py-1 text-right">{bl.genKwh[gi][selectedElasticSlot]}</td>
                            <td className="px-2 py-1 text-right font-bold text-blue-800">{aggElastic.fromGen[gi][selectedElasticSlot]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-600">發電 → 負載 明細（可搜尋電號）</p>
                    <Input
                      placeholder="篩選發電或負載電號…"
                      value={flowSearch}
                      onChange={(e) => setFlowSearch(e.target.value)}
                      className="h-8 max-w-xs bg-white text-xs"
                    />
                  </div>
                  <div className="mt-2 max-h-52 overflow-auto rounded border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-2 py-1 text-left">發電電號</th>
                          <th className="px-2 py-1 text-left">負載電號</th>
                          <th className="px-2 py-1 text-right">kWh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredElasticDetail.length === 0 ? (
                          <tr>
                            <td colSpan={3} className="px-2 py-3 text-center text-slate-500">
                              無明細或無符合篩選
                            </td>
                          </tr>
                        ) : (
                          filteredElasticDetail.map((f, i) => (
                            <tr key={`${f.genNo}-${f.loadNo}-${i}`} className="border-t border-slate-200">
                              <td className="px-2 py-1 font-mono">{f.genNo}</td>
                              <td className="px-2 py-1 font-mono">{f.loadNo}</td>
                              <td className="px-2 py-1 text-right font-semibold">{f.kwh}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="transfer" className="mt-4 space-y-4">
          <section className={sectionShell}>
            <h4 className="text-base font-bold text-slate-900">一鍵上傳電能移轉分配結果（可分配量 → 負載電號）</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              供給潛力欄位對應帳本核算後「本時段可分配之電能移轉量」。實體路徑（發電→儲能一充一放→移轉時段）於帳本紀錄；畫面以可分配總量呈現，代理人將該量分配至多個負載電號。支援 CSV（slot,
              load_meter, kwh）或 JSON。
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-800 hover:bg-slate-100">
                <i className="fas fa-file-arrow-up" />
                選擇檔案並上傳暫存
                <input type="file" accept=".csv,.json,text/csv,application/json" className="hidden" onChange={(e) => onTransferFile(e.target.files?.[0] ?? null)} />
              </label>
              <Button type="button" variant="outline" className="border-slate-300 bg-white" onClick={downloadTransferTemplate}>
                <i className="fas fa-download mr-2" />
                下載 CSV 範本
              </Button>
              <Button type="button" variant="secondary" onClick={fillDemoTransfer}>
                示範一鍵填入（暫存）
              </Button>
              {transferDraftAt ? (
                <Badge className="border border-emerald-300 bg-emerald-50 text-emerald-900">已暫存 · {transferDraftAt}</Badge>
              ) : (
                <Badge variant="outline" className="border-slate-300 text-slate-600">
                  尚未暫存
                </Badge>
              )}
            </div>
          </section>

          <section className={sectionShell}>
            <h4 className="text-base font-bold text-slate-900">每 15 分鐘總覽（供給潛力＝可分配移轉量）</h4>
            <div className="mt-3 max-h-[min(480px,55vh)] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px] text-xs">
                <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
                  <tr>
                    <th className="px-2 py-2 text-left font-bold">時段</th>
                    <th className="px-2 py-2 text-right font-bold">供給潛力（可分配移轉量）</th>
                    <th className="px-2 py-2 text-right font-bold">已分配移轉量</th>
                    <th className="px-2 py-2 text-center font-bold">明細筆數</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: SLOT_COUNT }, (_, s) => (
                    <tr
                      key={s}
                      onClick={() => setSelectedTransferSlot(s)}
                      className={`cursor-pointer border-t border-slate-200 ${
                        selectedTransferSlot === s ? 'bg-emerald-50' : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <td className="px-2 py-1.5 font-mono font-bold text-slate-800">{slotLabel(s)}</td>
                      <td className="px-2 py-1.5 text-right font-black text-purple-900">{bl.storageTransferCap[s]}</td>
                      <td className="px-2 py-1.5 text-right font-bold text-emerald-800">{aggTransfer.totalPerSlot[s]}</td>
                      <td className="px-2 py-1.5 text-center text-slate-500">{transferFlows[s].length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedTransferSlot !== null ? (
              <div className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-900">
                    時段 <span className="font-mono text-emerald-800">{slotLabel(selectedTransferSlot)}</span> 帳本與分配明細
                  </p>
                  <Button type="button" variant="ghost" size="sm" className="text-slate-600" onClick={() => setSelectedTransferSlot(null)}>
                    收合
                  </Button>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-600">系統帳本：移轉路徑摘要（示意）</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    實務由「發電電號 → 儲能設備一充一放 → 移轉時段」組成；下列為與本時段可分配量相關之帳本列示（正式環境由後端帳本 API 提供）。
                  </p>
                  <div className="mt-2 max-h-36 overflow-auto rounded border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-violet-50 text-slate-800">
                        <tr>
                          <th className="px-2 py-1 text-left">發電電號</th>
                          <th className="px-2 py-1 text-left">儲能設備</th>
                          <th className="px-2 py-1 text-left">移轉說明</th>
                          <th className="px-2 py-1 text-right">帳本量 kWh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {buildLedgerMock(selectedTransferSlot, genNos, bl).map((row, i) => (
                          <tr key={i} className="border-t border-slate-200 bg-white">
                            <td className="px-2 py-1 font-mono">{row.genNo}</td>
                            <td className="px-2 py-1 font-mono">{row.storageId}</td>
                            <td className="px-2 py-1">{row.shiftNote}</td>
                            <td className="px-2 py-1 text-right font-semibold">{row.kwh}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-bold text-slate-600">移轉量 → 負載電號 明細</p>
                  <div className="mt-2 max-h-40 overflow-auto rounded border border-slate-200">
                    <table className="w-full text-[11px]">
                      <thead className="sticky top-0 bg-slate-100 text-slate-700">
                        <tr>
                          <th className="px-2 py-1 text-left">負載電號</th>
                          <th className="px-2 py-1 text-right">kWh</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transferFlows[selectedTransferSlot].length === 0 ? (
                          <tr>
                            <td colSpan={2} className="px-2 py-3 text-center text-slate-500">
                              無明細
                            </td>
                          </tr>
                        ) : (
                          transferFlows[selectedTransferSlot].map((f, i) => (
                            <tr key={`${f.loadNo}-${i}`} className="border-t border-slate-200">
                              <td className="px-2 py-1 font-mono">{f.loadNo}</td>
                              <td className="px-2 py-1 text-right font-semibold">{f.kwh}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </section>
        </TabsContent>

        <TabsContent value="submit" className="mt-4 space-y-4">
          <section className={`${sectionShell} border-l-4 border-l-blue-500`}>
            <h4 className="text-base font-bold text-slate-900">送出與自動化檢核</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              兩份檔案皆已上傳暫存後，按下列按鈕合併檢核。規則一：彈性合計與各發電轉出不得超過實發；規則二：累積轉供與殘載填充（各負載）。
            </p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <span className="font-bold">再次確認：</span>
              {DISCLAIMER}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="text-sm font-semibold text-slate-700">
                彈性分配：
                {elasticDraftAt ? <Badge className="ml-2 bg-emerald-600 text-white">{elasticDraftAt}</Badge> : <Badge variant="destructive">未暫存</Badge>}
              </div>
              <div className="text-sm font-semibold text-slate-700">
                電能移轉：
                {transferDraftAt ? <Badge className="ml-2 bg-emerald-600 text-white">{transferDraftAt}</Badge> : <Badge variant="destructive">未暫存</Badge>}
              </div>
            </div>
            <div className="mt-4">
              <Button
                type="button"
                className="bg-slate-800 text-white hover:bg-slate-900"
                onClick={runSubmitValidation}
                disabled={!elasticDraftAt || !transferDraftAt}
              >
                <i className="fas fa-paper-plane mr-2" />
                送出兩份暫存並執行檢核
              </Button>
              {!elasticDraftAt || !transferDraftAt ? (
                <p className="mt-2 text-xs text-slate-500">請先完成彈性分配與電能移轉檔案上傳（或示範一鍵填入），兩者皆暫存後方可送檢。</p>
              ) : null}
            </div>
          </section>

          {validationIssues !== null && (
            <section
              className={`${sectionShell} ${
                validationIssues.length === 0 ? 'border-emerald-200 bg-emerald-50/50' : 'border-red-200 bg-red-50/40'
              }`}
            >
              <h4 className={`text-base font-bold ${validationIssues.length === 0 ? 'text-emerald-900' : 'text-red-900'}`}>
                {validationIssues.length === 0 ? (
                  <>
                    <i className="fas fa-circle-check mr-2" />
                    檢核結果：全部通過
                  </>
                ) : (
                  <>
                    <i className="fas fa-circle-xmark mr-2" />
                    檢核結果：待修正（{validationIssues.length} 筆）
                  </>
                )}
              </h4>
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {validationIssues.length > 0
                  ? '請依下列項目修正上傳檔或重新產製後再上傳暫存。'
                  : '可進行後續正式送件（實務由後端 API 銜接）。'}
              </p>
              {validationIssues.length > 0 && (
                <ScrollArea className="mt-3 h-96 rounded-lg border border-slate-200 bg-white pr-3">
                  <ul className="space-y-2 p-3">
                    {validationIssues.map((issue) => (
                      <li key={issue.id} className="rounded-lg border border-red-200 bg-white p-3 text-sm shadow-sm">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="destructive" className="font-mono">
                            {issue.rule}
                          </Badge>
                          <span className="font-bold text-slate-900">{issue.ruleTitle}</span>
                          {issue.meter ? (
                            <Badge variant="outline" className="border-slate-300 font-mono">
                              {issue.meter}
                            </Badge>
                          ) : null}
                          <Badge variant="secondary" className="font-mono">
                            {slotLabel(issue.slot)}
                          </Badge>
                        </div>
                        <p className="mt-1 font-semibold text-red-900">{issue.message}</p>
                        <p className="mt-1 text-slate-700 leading-relaxed">{issue.detail}</p>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </section>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
