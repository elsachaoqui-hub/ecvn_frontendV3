import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const SLOT_COUNT = 96;

const DISCLAIMER =
  '不論採行彈性分配或儲能電能移轉，其分配順序與額度均屬用戶自主管理範疇。若分配後仍有剩餘電量，該損失應由用戶自行承擔；本平台僅負責依據實測數據進行電量核算，不負擔剩餘電量之處置或補償責任。';

/** 與 5.2 月結算一致的白底區塊樣式 */
const sectionShell = 'rounded-2xl border border-slate-300 bg-white p-5 shadow-sm';
const panelShell = 'rounded-xl border border-slate-200 bg-white p-4';
const btnPrimary =
  'rounded-lg border border-slate-800 bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700';
const btnOutline =
  'rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50';

type MeterId = 'A' | 'B';

type AllocationMode = 'weight' | 'queue';

type Baseline = {
  genPotential: number[];
  loadA: number[];
  loadB: number[];
  physicalOut: number[];
  /** 該 15 分鐘儲能充入（用於規則二累積轉供試算欄位） */
  storageCharged: number[];
  /** 調節帳戶 C：儲能電能移轉成功量（可供移轉分配之上限參考） */
  storageTransferCap: number[];
};

function slotLabel(slot: number): string {
  const totalMin = slot * 15;
  const h = Math.floor(totalMin / 60) % 24;
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function hash01(seed: string, slot: number): number {
  let h = 2166136261 ^ slot;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function buildBaseline(settlementDate: string): Baseline {
  const genPotential: number[] = [];
  const loadA: number[] = [];
  const loadB: number[] = [];
  const physicalOut: number[] = [];
  const storageCharged: number[] = [];
  const storageTransferCap: number[] = [];

  for (let s = 0; s < SLOT_COUNT; s++) {
    const totalMin = s * 15;
    const hour = Math.floor(totalMin / 60) % 24;
    const sun = hour >= 6 && hour <= 18 ? Math.sin(((hour - 6) / 12) * Math.PI) : 0;
    const baseGen = 8 + sun * 42 + hash01(settlementDate, s) * 6;
    const g = Math.round(baseGen * 10) / 10;
    genPotential.push(g);

    const la = Math.round((g * (0.38 + hash01(`${settlementDate}:la`, s) * 0.22) + hash01(`${settlementDate}:lax`, s) * 4) * 10) / 10;
    const lb = Math.round((g * (0.32 + hash01(`${settlementDate}:lb`, s) * 0.2) + hash01(`${settlementDate}:lbx`, s) * 3) * 10) / 10;
    loadA.push(Math.max(0.1, la));
    loadB.push(Math.max(0.1, lb));

    const phys = Math.round((g + 2 + hash01(`${settlementDate}:po`, s) * 5) * 10) / 10;
    physicalOut.push(phys);

    const stc = hour >= 10 && hour <= 15 ? Math.round((4 + sun * 8 + hash01(`${settlementDate}:st`, s) * 3) * 10) / 10 : 0;
    storageCharged.push(stc);

    const cap = Math.round((hour >= 18 && hour <= 22 ? 6 + hash01(`${settlementDate}:cap`, s) * 8 : hash01(`${settlementDate}:cap2`, s) * 3) * 10) / 10;
    storageTransferCap.push(Math.max(0.1, cap));
  }

  return { genPotential, loadA, loadB, physicalOut, storageCharged, storageTransferCap };
}

function emptyAlloc(): Record<MeterId, number[]> {
  return {
    A: Array.from({ length: SLOT_COUNT }, () => 0),
    B: Array.from({ length: SLOT_COUNT }, () => 0),
  };
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function computeAllocation(
  baseline: Baseline,
  mode: AllocationMode,
  weightA: number,
  weightB: number,
  queueOrder: [MeterId, MeterId],
  kind: 'elastic' | 'transfer'
): Record<MeterId, number[]> {
  const out = emptyAlloc();
  for (let s = 0; s < SLOT_COUNT; s++) {
    const la = baseline.loadA[s];
    const lb = baseline.loadB[s];
    const gen = baseline.genPotential[s];
    const capBase = Math.min(gen, la + lb);
    const cap =
      kind === 'elastic'
        ? capBase
        : Math.min(capBase, baseline.storageTransferCap[s], la + lb);

    if (mode === 'weight') {
      const wa = Math.max(0, weightA);
      const wb = Math.max(0, weightB);
      const sum = wa + wb || 1;
      let a = Math.min(la, cap * (wa / sum));
      let b = Math.min(lb, cap * (wb / sum));
      if (a + b > cap) {
        const sc = cap / (a + b);
        a *= sc;
        b *= sc;
      }
      out.A[s] = round1(a);
      out.B[s] = round1(b);
    } else {
      let rem = cap;
      for (const id of queueOrder) {
        if (id === 'A') {
          const take = Math.min(la, rem);
          out.A[s] = round1(take);
          rem -= take;
        } else {
          const take = Math.min(lb, rem);
          out.B[s] = round1(take);
          rem -= take;
        }
      }
    }
  }
  return out;
}

type RuleCode = 'R1' | 'R2a' | 'R2b';

type ValidationIssue = {
  id: string;
  rule: RuleCode;
  ruleTitle: string;
  slot: number;
  meter?: MeterId;
  message: string;
  detail: string;
};

function validateMerged(
  baseline: Baseline,
  elastic: Record<MeterId, number[]>,
  transfer: Record<MeterId, number[]>
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  let id = 0;

  for (let s = 0; s < SLOT_COUNT; s++) {
    const gen = baseline.genPotential[s];
    const la = baseline.loadA[s];
    const lb = baseline.loadB[s];
    const eSum = elastic.A[s] + elastic.B[s];
    const tSum = transfer.A[s] + transfer.B[s];
    const charged = baseline.storageCharged[s];
    const phys = baseline.physicalOut[s];

    if (eSum > gen + 0.05) {
      issues.push({
        id: `r1-${s}-${id++}`,
        rule: 'R1',
        ruleTitle: '規則一：彈性分配基本規則（物理產量限制）',
        slot: s,
        message: `時段 ${slotLabel(s)} 彈性分配合計超過發電端供給潛力`,
        detail: `彈性合計 ${round1(eSum)} kWh > 結算用發電供給潛力 ${round1(gen)} kWh。請調降各電號彈性分配量或重新試算。`,
      });
    }

    const instantElastic = eSum;
    if (charged + instantElastic + tSum > phys + 0.05) {
      issues.push({
        id: `r2a-${s}-${id++}`,
        rule: 'R2a',
        ruleTitle: '規則二：累積轉供限制（儲能充入＋即時轉供＋移轉分配）',
        slot: s,
        message: `時段 ${slotLabel(s)} 儲能充入、即時彈性轉供與移轉分配之和超過案場即時物理產出`,
        detail: `(${round1(charged)} + ${round1(instantElastic)} + ${round1(tSum)}) kWh > 物理產出 ${round1(phys)} kWh。請調降儲能移轉分配或彈性分配量。`,
      });
    }

    const resA = Math.max(0, la - elastic.A[s]);
    const resB = Math.max(0, lb - elastic.B[s]);
    if (transfer.A[s] > resA + 0.05) {
      issues.push({
        id: `r2b-A-${s}-${id++}`,
        rule: 'R2b',
        ruleTitle: '規則二：殘載填充限制（面積檢核）',
        slot: s,
        meter: 'A',
        message: `時段 ${slotLabel(s)} 電號 A 儲能移轉分配超過殘餘負載`,
        detail: `移轉分配 ${round1(transfer.A[s])} kWh > 扣除即時彈性轉供後剩餘負載 ${round1(resA)} kWh。請調降移轉量或提高彈性分配填補缺口。`,
      });
    }
    if (transfer.B[s] > resB + 0.05) {
      issues.push({
        id: `r2b-B-${s}-${id++}`,
        rule: 'R2b',
        ruleTitle: '規則二：殘載填充限制（面積檢核）',
        slot: s,
        meter: 'B',
        message: `時段 ${slotLabel(s)} 電號 B 儲能移轉分配超過殘餘負載`,
        detail: `移轉分配 ${round1(transfer.B[s])} kWh > 扣除即時彈性轉供後剩餘負載 ${round1(resB)} kWh。請調降移轉量或提高彈性分配填補缺口。`,
      });
    }
  }

  return issues;
}

type WorkbenchProps = {
  title: string;
  description: string;
  baseline: Baseline;
  mode: AllocationMode;
  setMode: (m: AllocationMode) => void;
  weightA: number;
  weightB: number;
  setWeightA: (n: number) => void;
  setWeightB: (n: number) => void;
  queueOrder: [MeterId, MeterId];
  setQueueOrder: (o: [MeterId, MeterId]) => void;
  allocation: Record<MeterId, number[]>;
  setAllocation: Dispatch<SetStateAction<Record<MeterId, number[]>>>;
  manualEdit: boolean;
  setManualEdit: (v: boolean) => void;
  draftSavedAt: string | null;
  formPrefix: string;
  onTrial: () => void;
  onSaveDraft: () => void;
  computeTrial: () => Record<MeterId, number[]>;
};

function WorkbenchSection({
  title,
  description,
  formPrefix,
  baseline,
  mode,
  setMode,
  weightA,
  weightB,
  setWeightA,
  setWeightB,
  queueOrder,
  setQueueOrder,
  allocation,
  setAllocation,
  manualEdit,
  setManualEdit,
  draftSavedAt,
  onTrial,
  onSaveDraft,
  computeTrial,
}: WorkbenchProps) {
  const weightSum = weightA + weightB;

  const updateCell = (meter: MeterId, slot: number, raw: string) => {
    const v = Number(raw);
    if (Number.isNaN(v) || v < 0) return;
    setAllocation((prev) => {
      const next = { A: [...prev.A], B: [...prev.B] };
      next[meter][slot] = round1(v);
      return next;
    });
  };

  const summary = useMemo(() => {
    let sumA = 0;
    let sumB = 0;
    for (let s = 0; s < SLOT_COUNT; s++) {
      sumA += allocation.A[s];
      sumB += allocation.B[s];
    }
    return { sumA: round1(sumA), sumB: round1(sumB), sum: round1(sumA + sumB) };
  }, [allocation]);

  return (
    <section className={sectionShell}>
      <div>
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        <p className="mt-2 text-sm font-semibold text-slate-600 leading-relaxed">{description}</p>
      </div>
      <div className="mt-5 space-y-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-amber-950">
          <p className="font-bold text-amber-900 mb-1">
            <i className="fas fa-triangle-exclamation mr-2" />
            分配注意事項
          </p>
          <p className="leading-relaxed font-semibold">{DISCLAIMER}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className={`space-y-4 ${panelShell}`}>
            <h3 className="text-sm font-black text-slate-900">參數設定區</h3>
            <div className="space-y-3">
              <Label className="text-slate-700">分配模式</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as AllocationMode)}
                className="flex flex-col gap-2"
              >
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                  <RadioGroupItem value="weight" id={`${formPrefix}-mode-weight`} />
                  <span>
                    <span className="font-bold text-slate-800">權重比例模式</span>
                    <span className="text-slate-500"> — 各電號固定百分比（例：A 40%、B 60%）</span>
                  </span>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                  <RadioGroupItem value="queue" id={`${formPrefix}-mode-queue`} />
                  <span>
                    <span className="font-bold text-slate-800">排隊優先模式</span>
                    <span className="text-slate-500"> — 依順序填滿前一用戶負載後再分配下一個</span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            {mode === 'weight' ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-slate-600">A 電號 權重（%）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={weightA}
                    onChange={(e) => setWeightA(Number(e.target.value))}
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs text-slate-600">B 電號 權重（%）</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={weightB}
                    onChange={(e) => setWeightB(Number(e.target.value))}
                    className="mt-1 bg-white"
                  />
                </div>
                {Math.abs(weightSum - 100) > 0.01 && (
                  <p className="col-span-2 text-xs text-amber-700">
                    目前合計 {round1(weightSum)}%，試算時將依比例正規化計算。
                  </p>
                )}
              </div>
            ) : (
              <div>
                <Label className="text-xs text-slate-600">排隊順序（先填滿前者負載）</Label>
                <Select
                  value={`${queueOrder[0]},${queueOrder[1]}`}
                  onValueChange={(v) => {
                    const [a, b] = v.split(',') as [MeterId, MeterId];
                    setQueueOrder([a, b]);
                  }}
                >
                  <SelectTrigger className="mt-1 w-full max-w-xs bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A,B">先 A 後 B</SelectItem>
                    <SelectItem value="B,A">先 B 後 A</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <button type="button" className={btnPrimary} onClick={onTrial}>
                <i className="fas fa-calculator mr-2" />
                試算分配
              </button>
              <button type="button" className={btnOutline} onClick={onSaveDraft}>
                <i className="fas fa-floppy-disk mr-2" />
                儲存暫存
              </button>
              <button
                type="button"
                className={manualEdit ? `${btnPrimary} bg-slate-600 border-slate-600` : btnOutline}
                onClick={() => {
                  if (!manualEdit) {
                    setAllocation(computeTrial());
                  }
                  setManualEdit(!manualEdit);
                }}
              >
                <i className={`fas ${manualEdit ? 'fa-lock-open' : 'fa-pen-to-square'} mr-2`} />
                {manualEdit ? '結束人工修改' : '進入人工修改（15 分鐘明細）'}
              </button>
            </div>
            {draftSavedAt ? (
              <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800">
                已暫存 · {draftSavedAt}
              </Badge>
            ) : (
              <p className="text-xs text-slate-500">尚未暫存。試算後可按「儲存暫存」保留草稿。</p>
            )}
          </div>

          <div className={`space-y-3 ${panelShell}`}>
            <h3 className="text-sm font-black text-slate-900">試算結果彙總（全日）</h3>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold text-slate-500">A 電號</p>
                <p className="mt-1 text-lg font-black text-slate-800">{summary.sumA} kWh</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-xs font-bold text-slate-500">B 電號</p>
                <p className="mt-1 text-lg font-black text-slate-800">{summary.sumB} kWh</p>
              </div>
              <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
                <p className="text-xs font-bold text-slate-600">合計</p>
                <p className="mt-1 text-lg font-black text-slate-900">{summary.sum} kWh</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-500 leading-relaxed">
              數據來源示意：轉直供系統之每 15 分鐘結算發電／用電、調節帳戶 C 移轉成功量；正式環境由後端介接與核算。
            </p>
          </div>
        </div>

        <div className={panelShell}>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">每 15 分鐘分配明細</h3>
            {manualEdit ? (
              <Badge className="bg-amber-500 text-white">人工修改中</Badge>
            ) : (
              <Badge variant="secondary">唯讀</Badge>
            )}
          </div>
          <ScrollArea className="h-[min(420px,50vh)] rounded-lg border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-100">
                  <TableHead className="w-24 font-bold text-slate-700">時段</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">供給潛力</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">A 負載</TableHead>
                  <TableHead className="text-right font-bold text-slate-700">B 負載</TableHead>
                  <TableHead className="text-right font-bold text-slate-800">A 分配</TableHead>
                  <TableHead className="text-right font-bold text-slate-800">B 分配</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: SLOT_COUNT }, (_, s) => (
                  <TableRow key={s} className={s % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                    <TableCell className="font-mono text-xs font-semibold text-slate-700">{slotLabel(s)}</TableCell>
                    <TableCell className="text-right text-sm">{baseline.genPotential[s]}</TableCell>
                    <TableCell className="text-right text-sm">{baseline.loadA[s]}</TableCell>
                    <TableCell className="text-right text-sm">{baseline.loadB[s]}</TableCell>
                    <TableCell className="text-right p-1">
                      {manualEdit ? (
                        <Input
                          className="h-8 text-right font-mono text-sm"
                          value={String(allocation.A[s])}
                          onChange={(e) => updateCell('A', s, e.target.value)}
                        />
                      ) : (
                        <span className="pr-2 font-mono text-sm">{allocation.A[s]}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right p-1">
                      {manualEdit ? (
                        <Input
                          className="h-8 text-right font-mono text-sm"
                          value={String(allocation.B[s])}
                          onChange={(e) => updateCell('B', s, e.target.value)}
                        />
                      ) : (
                        <span className="pr-2 font-mono text-sm">{allocation.B[s]}</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      </div>
    </section>
  );
}

export default function DashboardMvrnAllocationPage() {
  const [settlementDate, setSettlementDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [planGroup, setPlanGroup] = useState('PG-2026-001');

  const baseline = useMemo(() => buildBaseline(settlementDate), [settlementDate]);

  useEffect(() => {
    setElasticAlloc(emptyAlloc());
    setTransferAlloc(emptyAlloc());
    setElasticDraftAt(null);
    setTransferDraftAt(null);
    setValidationIssues(null);
    setElasticManual(false);
    setTransferManual(false);
  }, [settlementDate]);

  const [elasticMode, setElasticMode] = useState<AllocationMode>('weight');
  const [elasticWeightA, setElasticWeightA] = useState(40);
  const [elasticWeightB, setElasticWeightB] = useState(60);
  const [elasticQueue, setElasticQueue] = useState<[MeterId, MeterId]>(['A', 'B']);
  const [elasticAlloc, setElasticAlloc] = useState(emptyAlloc);
  const [elasticManual, setElasticManual] = useState(false);
  const [elasticDraftAt, setElasticDraftAt] = useState<string | null>(null);

  const [transferMode, setTransferMode] = useState<AllocationMode>('weight');
  const [transferWeightA, setTransferWeightA] = useState(40);
  const [transferWeightB, setTransferWeightB] = useState(60);
  const [transferQueue, setTransferQueue] = useState<[MeterId, MeterId]>(['A', 'B']);
  const [transferAlloc, setTransferAlloc] = useState(emptyAlloc);
  const [transferManual, setTransferManual] = useState(false);
  const [transferDraftAt, setTransferDraftAt] = useState<string | null>(null);

  const [validationIssues, setValidationIssues] = useState<ValidationIssue[] | null>(null);

  const computeElasticTrial = useCallback(
    () => computeAllocation(baseline, elasticMode, elasticWeightA, elasticWeightB, elasticQueue, 'elastic'),
    [baseline, elasticMode, elasticWeightA, elasticWeightB, elasticQueue]
  );

  const computeTransferTrial = useCallback(
    () => computeAllocation(baseline, transferMode, transferWeightA, transferWeightB, transferQueue, 'transfer'),
    [baseline, transferMode, transferWeightA, transferWeightB, transferQueue]
  );

  const runSubmitValidation = () => {
    const issues = validateMerged(baseline, elasticAlloc, transferAlloc);
    setValidationIssues(issues);
    if (issues.length === 0) {
      toast.success('檢核通過', { description: '兩類分配與每 15 分鐘結算時段均符合規則一與規則二。' });
    } else {
      toast.error('檢核未通過', { description: `共 ${issues.length} 筆待修正項目，請依明細調整後再試。` });
    }
  };

  const fmtNow = () =>
    new Date().toLocaleString('zh-TW', { hour12: false, dateStyle: 'short', timeStyle: 'short' });

  return (
    <div className="space-y-6 pb-8 text-slate-800 max-w-7xl mx-auto">
      <section className={sectionShell}>
        <h3 className="text-lg font-bold text-slate-900">2.5 MVRN 分配</h3>
        <p className="mt-2 max-w-4xl text-sm font-semibold text-slate-600 leading-relaxed">
          跨市場協作結算與合規檢核：介接轉直供系統之每 15 分鐘發／用電結算量，併入調節帳戶 C 儲能移轉成功量後，由代理人設定彈性分配與儲能移轉策略、試算並暫存，最後送出執行自動化檢核。
        </p>
      </section>

      <section className={sectionShell}>
        <h3 className="text-sm font-black text-slate-900">
          <i className="fas fa-circle-info mr-2 text-slate-600" />
          流程說明
        </h3>
        <p className="mt-3 text-sm font-semibold text-slate-600 leading-relaxed">
          請先於「彈性分配」與「電能移轉」分頁完成參數設定、試算與暫存；再於「送出與自動檢核」合併檢核兩份暫存結果。若出現不合規則之處，請回到前兩頁以人工修改模式細修每 15
          分鐘分配量，直至檢核通過。
        </p>
      </section>

      <section className={sectionShell}>
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <Label className="text-xs font-bold text-slate-600">結算日（示意）</Label>
            <Input
              type="date"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
              className="mt-1 w-44 border-slate-300 bg-white"
            />
          </div>
          <div>
            <Label className="text-xs font-bold text-slate-600">計畫群組</Label>
            <Input
              value={planGroup}
              onChange={(e) => setPlanGroup(e.target.value)}
              className="mt-1 w-48 border-slate-300 bg-white"
            />
          </div>
        </div>
      </section>

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

        <TabsContent value="elastic" className="mt-4">
          <WorkbenchSection
            formPrefix="mvrn-elastic"
            title="彈性分配 — 分配作業介面"
            description="設定「彈性分配」之權重比例或排隊優先，執行試算後可儲存暫存；必要時進入人工修改逐時段微調。"
            baseline={baseline}
            mode={elasticMode}
            setMode={setElasticMode}
            weightA={elasticWeightA}
            weightB={elasticWeightB}
            setWeightA={setElasticWeightA}
            setWeightB={setElasticWeightB}
            queueOrder={elasticQueue}
            setQueueOrder={setElasticQueue}
            allocation={elasticAlloc}
            setAllocation={setElasticAlloc}
            manualEdit={elasticManual}
            setManualEdit={setElasticManual}
            draftSavedAt={elasticDraftAt}
            computeTrial={computeElasticTrial}
            onTrial={() => {
              setElasticAlloc(computeElasticTrial());
              setElasticManual(false);
              toast.message('試算完成', { description: '已依參數更新彈性分配結果（每 15 分鐘）。' });
            }}
            onSaveDraft={() => {
              setElasticDraftAt(fmtNow());
              toast.success('彈性分配已暫存');
            }}
          />
        </TabsContent>

        <TabsContent value="transfer" className="mt-4">
          <WorkbenchSection
            formPrefix="mvrn-transfer"
            title="儲能電能移轉 — 分配作業介面"
            description="設定「儲能電能移轉」之權重比例或排隊優先（同邏輯套用於移轉可分配電量上限），試算後可儲存暫存並支援人工修改。"
            baseline={baseline}
            mode={transferMode}
            setMode={setTransferMode}
            weightA={transferWeightA}
            weightB={transferWeightB}
            setWeightA={setTransferWeightA}
            setWeightB={setTransferWeightB}
            queueOrder={transferQueue}
            setQueueOrder={setTransferQueue}
            allocation={transferAlloc}
            setAllocation={setTransferAlloc}
            manualEdit={transferManual}
            setManualEdit={setTransferManual}
            draftSavedAt={transferDraftAt}
            computeTrial={computeTransferTrial}
            onTrial={() => {
              setTransferAlloc(computeTransferTrial());
              setTransferManual(false);
              toast.message('試算完成', { description: '已依參數更新儲能移轉分配結果（每 15 分鐘）。' });
            }}
            onSaveDraft={() => {
              setTransferDraftAt(fmtNow());
              toast.success('電能移轉已暫存');
            }}
          />
        </TabsContent>

        <TabsContent value="submit" className="mt-4 space-y-4">
          <section className={`${sectionShell} border-l-4 border-l-slate-400`}>
            <h4 className="text-base font-bold text-slate-900">合併送出與自動化檢核</h4>
            <p className="mt-2 text-sm font-semibold text-slate-600">
              將彈性分配與電能移轉兩份暫存結果一併送檢。系統依每 15 分鐘結算時段執行規則一（物理產量限制）與規則二（累積轉供、殘載填充／面積檢核）。
            </p>
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              <span className="font-bold">再次確認：</span>
              {DISCLAIMER}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="text-sm font-semibold text-slate-700">
                彈性分配：
                {elasticDraftAt ? (
                  <Badge className="ml-2 bg-emerald-600 text-white">已暫存 {elasticDraftAt}</Badge>
                ) : (
                  <Badge variant="destructive">尚未暫存</Badge>
                )}
              </div>
              <div className="text-sm font-semibold text-slate-700">
                電能移轉：
                {transferDraftAt ? (
                  <Badge className="ml-2 bg-emerald-600 text-white">已暫存 {transferDraftAt}</Badge>
                ) : (
                  <Badge variant="destructive">尚未暫存</Badge>
                )}
              </div>
            </div>
            <div className="mt-4">
              <button
                type="button"
                className={`${btnPrimary} disabled:cursor-not-allowed disabled:opacity-50`}
                onClick={runSubmitValidation}
                disabled={!elasticDraftAt || !transferDraftAt}
              >
                <i className="fas fa-paper-plane mr-2" />
                送出兩份暫存並執行檢核
              </button>
              {!elasticDraftAt || !transferDraftAt ? (
                <p className="mt-2 text-xs font-semibold text-slate-500">請先於前兩頁各完成一次「儲存暫存」後再送出。</p>
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
                  ? '請依下列明細修正後，回到「彈性分配作業」或「電能移轉作業」調整參數或進入人工修改模式細修該時段之分配量。'
                  : '可進行後續正式送件流程（實際由後端 API 銜接）。'}
              </p>
              {validationIssues.length > 0 && (
                <ScrollArea className="mt-3 h-[min(360px,45vh)] rounded-lg border border-slate-200 bg-white pr-3">
                  <ul className="space-y-2 p-3">
                    {validationIssues.map((issue) => (
                      <li key={issue.id} className="rounded-lg border border-red-200 bg-white p-3 text-sm shadow-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="destructive" className="font-mono">
                            {issue.rule}
                          </Badge>
                          <span className="font-bold text-slate-900">{issue.ruleTitle}</span>
                          {issue.meter ? (
                            <Badge variant="outline" className="border-slate-300">
                              電號 {issue.meter}
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
