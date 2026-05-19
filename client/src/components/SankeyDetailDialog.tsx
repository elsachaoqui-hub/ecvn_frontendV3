import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  aggregateSankeyFlows,
  getSankeyAsset,
  getSankeyFlows,
  getSankeyFlowsForDates,
  getSankeySlotDetail,
  getSankeySlotDetailsForDates,
  loadSankeyExplorerDataset,
  type AggregatedFlowRow,
  type SankeySlotDetailRow,
} from '@/lib/sankeyExplorerCsv';

export type SankeyMetricFocus =
  | 'generation'
  | 'load'
  | 'storageIn'
  | 'storageOut'
  | 'balance'
  | 'contract'
  | 'total'
  | 'all';

export type SankeyDetailFocus =
  | {
      kind: 'slot';
      periodLabel: string;
      dateLabel: string;
      timeLabel: string;
      metric: SankeyMetricFocus;
    }
  | {
      kind: 'period';
      periodLabel: string;
      dateLabels: string[];
      metric: SankeyMetricFocus;
    }
  | {
      kind: 'node';
      periodLabel: string;
      dateLabels: string[];
      timeLabel?: string;
      nodeName: string;
    }
  | {
      kind: 'edge';
      periodLabel: string;
      dateLabels: string[];
      timeLabel?: string;
      sourceNode: string;
      targetNode: string;
    };

type SankeyDetailDialogProps = {
  focus: SankeyDetailFocus | null;
  onClose: () => void;
};

const GEN_IDS = ['G1', 'G2', 'G3', 'G4', 'G5'] as const;
const LOAD_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'] as const;

const METRIC_LABEL: Record<SankeyMetricFocus, string> = {
  generation: '發電端（量測）',
  load: '用電端（量測）',
  storageIn: '儲能存入（+）',
  storageOut: '儲能提領（-）',
  balance: '儲能餘額（∑）',
  contract: '合約匹配',
  total: '總匹配',
  all: '完整明細',
};

function assetLabel(assetId: string): string {
  if (!assetId) return '（節點彙總）';
  const asset = getSankeyAsset(assetId);
  if (!asset) return assetId;
  return `${assetId} · ${asset.siteName}（${asset.resourceType}）`;
}

function FlowTable({ rows, showSlotCount }: { rows: AggregatedFlowRow[]; showSlotCount?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-600">此範圍無對應流向紀錄。</p>;
  }
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="sticky top-0 bg-slate-100 text-slate-800">
          <tr>
            <th className="px-2 py-1.5 text-left font-bold">來源</th>
            <th className="px-2 py-1.5 text-left font-bold">電號</th>
            <th className="px-2 py-1.5 text-center font-bold">→</th>
            <th className="px-2 py-1.5 text-left font-bold">去向</th>
            <th className="px-2 py-1.5 text-left font-bold">電號</th>
            <th className="px-2 py-1.5 text-right font-bold">kWh</th>
            {showSlotCount ? <th className="px-2 py-1.5 text-right font-bold">時段數</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.sourceNode}-${r.targetNode}-${i}`} className="border-t border-slate-100 text-slate-900">
              <td className="px-2 py-1.5 font-semibold">{r.sourceNode}</td>
              <td className="px-2 py-1.5 text-slate-600">{assetLabel(r.sourceAssetId)}</td>
              <td className="px-2 py-1.5 text-center text-indigo-600">→</td>
              <td className="px-2 py-1.5 font-semibold">{r.targetNode}</td>
              <td className="px-2 py-1.5 text-slate-600">{assetLabel(r.targetAssetId)}</td>
              <td className="px-2 py-1.5 text-right tabular-nums font-bold">{r.flowKwh.toFixed(3)}</td>
              {showSlotCount ? (
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{r.slotCount}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetKwTable({
  title,
  ids,
  kw,
  kwh,
  unit,
}: {
  title: string;
  ids: readonly string[];
  kw: Record<string, number>;
  kwh: Record<string, number>;
  unit: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="text-xs font-bold text-slate-700">{title}</p>
      <table className="mt-2 min-w-full text-xs">
        <thead>
          <tr className="text-slate-600">
            <th className="py-1 text-left font-bold">電號</th>
            <th className="py-1 text-left font-bold">場站</th>
            <th className="py-1 text-right font-bold">kW</th>
            <th className="py-1 text-right font-bold">{unit}</th>
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const asset = getSankeyAsset(id);
            return (
              <tr key={id} className="border-t border-slate-100 text-slate-900">
                <td className="py-1 font-bold">{id}</td>
                <td className="py-1 text-slate-600">{asset?.siteName ?? '—'}</td>
                <td className="py-1 text-right tabular-nums">{(kw[id] ?? 0).toFixed(3)}</td>
                <td className="py-1 text-right tabular-nums font-semibold">{(kwh[id] ?? 0).toFixed(3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlotSummary({ slot }: { slot: SankeySlotDetailRow }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {Object.entries(slot.sankeyNodes).map(([name, value]) => (
        <div key={name} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs">
          <span className="font-bold text-slate-700">{name}</span>
          <span className="ml-2 tabular-nums font-black text-indigo-800">{value.toFixed(3)} kWh</span>
        </div>
      ))}
    </div>
  );
}

function filterFlowsForMetric(
  flows: ReturnType<typeof getSankeyFlows>,
  metric: SankeyMetricFocus
): ReturnType<typeof getSankeyFlows> {
  switch (metric) {
    case 'generation':
      return flows.filter((f) => f.sourceNode === '發電端');
    case 'load':
      return flows.filter((f) => f.targetNode === '用電端' || f.sourceNode === '用電端');
    case 'storageIn':
      return flows.filter(
        (f) =>
          f.targetNode === '儲能' ||
          f.targetNode === '儲能存入量' ||
          f.flowType.includes('storage') ||
          f.flowType === 'balance_storage'
      );
    case 'storageOut':
      return flows.filter((f) => f.sourceNode === '儲能' || f.sourceNode === '用電端轉移量');
    case 'contract':
      return flows.filter((f) => f.sourceNode === '合約數量' || f.targetNode === '合約數量');
    case 'total':
      return flows.filter((f) => f.targetNode === '成功匹配量' || f.sourceNode === '用電端轉移量');
    case 'balance':
      return flows.filter((f) => f.sourceNode === '儲能餘額' || f.targetNode === '儲能餘額');
    default:
      return flows;
  }
}

function SlotDetailBody({
  slot,
  metric,
}: {
  slot: SankeySlotDetailRow;
  metric: SankeyMetricFocus;
}) {
  const flows = filterFlowsForMetric(getSankeyFlows(slot.dateLabel, slot.timeLabel), metric);
  const agg = aggregateSankeyFlows(flows);

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 px-3 py-2 text-sm">
        <p className="font-bold text-indigo-900">
          {slot.dateLabel} {slot.timeLabel}
        </p>
        <p className="mt-1 text-xs text-indigo-800">
          合約轉供 {slot.contractTransferKwh.toFixed(3)} kWh · 儲能排程 {slot.storagePlanKwh.toFixed(3)} kWh ·
          成功匹配 {slot.transferSuccessKwh.toFixed(3)} kWh · 餘電 {slot.surplusKwh.toFixed(3)} kWh
        </p>
      </div>

      {(metric === 'generation' || metric === 'all') && (
        <AssetKwTable
          title="發電電號 G1～G5（kW / kWh）"
          ids={GEN_IDS}
          kw={slot.generationByAssetKw}
          kwh={slot.generationByAssetKwh}
          unit="kWh"
        />
      )}

      {(metric === 'load' || metric === 'all') && (
        <AssetKwTable
          title="負載電號 L1～L5（kW / kWh）"
          ids={LOAD_IDS}
          kw={slot.loadByAssetKw}
          kwh={slot.loadByAssetKwh}
          unit="kWh"
        />
      )}

      {(metric === 'balance' || metric === 'all') && (
        <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-xs">
          <p className="font-bold text-teal-900">儲能餘額</p>
          <p className="mt-1 tabular-nums">
            時段初 {slot.prevStorageBalanceKwh.toFixed(3)} → 時段末 {slot.endStorageBalanceKwh.toFixed(3)} kWh
          </p>
          <p className="mt-1 text-slate-700">
            存入 {slot.storageChargeKwh.toFixed(3)} · 提領 {slot.storageDischargeKwh.toFixed(3)} kWh
          </p>
        </div>
      )}

      {metric === 'all' && <SlotSummary slot={slot} />}

      <div>
        <p className="mb-2 text-xs font-bold text-slate-700">電力流向（來源 → 去向）</p>
        <FlowTable rows={agg} />
      </div>
    </div>
  );
}

function PeriodDetailBody({
  dateLabels,
  metric,
}: {
  dateLabels: string[];
  metric: SankeyMetricFocus;
}) {
  const flows = filterFlowsForMetric(getSankeyFlowsForDates(dateLabels), metric);
  const agg = aggregateSankeyFlows(flows);
  const slots = getSankeySlotDetailsForDates(dateLabels);

  const sumGen = slots.reduce((s, r) => s + r.generationTotalKwh, 0);
  const sumLoad = slots.reduce((s, r) => s + r.loadTotalKwh, 0);
  const sumContract = slots.reduce((s, r) => s + r.contractMatchedKwh, 0);
  const sumMatched = slots.reduce((s, r) => s + r.transferSuccessKwh, 0);

  const genByAsset = Object.fromEntries(
    GEN_IDS.map((id) => [id, slots.reduce((s, r) => s + (r.generationByAssetKwh[id] ?? 0), 0)])
  );
  const loadByAsset = Object.fromEntries(
    LOAD_IDS.map((id) => [id, slots.reduce((s, r) => s + (r.loadByAssetKwh[id] ?? 0), 0)])
  );

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
        <p>
          共 {dateLabels.length} 日 · {slots.length} 個 15 分鐘時段 · 發電加總 {sumGen.toFixed(1)} kWh · 用電{' '}
          {sumLoad.toFixed(1)} kWh
        </p>
        <p className="mt-1">
          合約匹配 {sumContract.toFixed(1)} · 成功匹配 {sumMatched.toFixed(1)} kWh
        </p>
      </div>

      {(metric === 'generation' || metric === 'all') && (
        <AssetKwTable
          title="發電電號加總（kWh）"
          ids={GEN_IDS}
          kw={Object.fromEntries(GEN_IDS.map((id) => [id, 0]))}
          kwh={genByAsset}
          unit="kWh 加總"
        />
      )}

      {(metric === 'load' || metric === 'all') && (
        <AssetKwTable
          title="負載電號加總（kWh）"
          ids={LOAD_IDS}
          kw={Object.fromEntries(LOAD_IDS.map((id) => [id, 0]))}
          kwh={loadByAsset}
          unit="kWh 加總"
        />
      )}

      <div>
        <p className="mb-2 text-xs font-bold text-slate-700">區間流向加總（依來源／去向／電號合併）</p>
        <FlowTable rows={agg} showSlotCount />
      </div>
    </div>
  );
}

function NodeEdgeBody({
  dateLabels,
  timeLabel,
  nodeName,
  sourceNode,
  targetNode,
}: {
  dateLabels: string[];
  timeLabel?: string;
  nodeName?: string;
  sourceNode?: string;
  targetNode?: string;
}) {
  let flows = timeLabel
    ? getSankeyFlows(dateLabels[0], timeLabel)
    : getSankeyFlowsForDates(dateLabels);

  if (nodeName) {
    flows = flows.filter((f) => f.sourceNode === nodeName || f.targetNode === nodeName);
  }
  if (sourceNode && targetNode) {
    flows = flows.filter((f) => f.sourceNode === sourceNode && f.targetNode === targetNode);
  }

  const agg = aggregateSankeyFlows(flows);
  const total = agg.reduce((s, r) => s + r.flowKwh, 0);

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold text-slate-800">
        流量加總 <span className="tabular-nums text-indigo-800">{total.toFixed(3)} kWh</span>
        {timeLabel ? ` · 時段 ${timeLabel}` : ` · ${dateLabels.length} 日彙總`}
      </p>
      <FlowTable rows={agg} showSlotCount={!timeLabel} />
    </div>
  );
}

export default function SankeyDetailDialog({ focus, onClose }: SankeyDetailDialogProps) {
  const assets = loadSankeyExplorerDataset().assets;

  let title = '桑基明細';
  let description = '';

  if (focus?.kind === 'slot') {
    title = `${METRIC_LABEL[focus.metric]} · ${focus.timeLabel}`;
    description = `${focus.periodLabel} — 15 分鐘時段明細（含 G1～G5、L1～L5 與流向）`;
  } else if (focus?.kind === 'period') {
    title = `${METRIC_LABEL[focus.metric]} · 區間加總`;
    description = `${focus.periodLabel} — ${focus.dateLabels.length} 日資料組成明細`;
  } else if (focus?.kind === 'node') {
    title = `節點「${focus.nodeName}」`;
    description = focus.timeLabel
      ? `${focus.periodLabel} ${focus.timeLabel}`
      : `${focus.periodLabel} — 區間內所有相關流向`;
  } else if (focus?.kind === 'edge') {
    title = `${focus.sourceNode} → ${focus.targetNode}`;
    description = focus.timeLabel
      ? `${focus.periodLabel} ${focus.timeLabel}`
      : `${focus.periodLabel} — 區間內連線加總`;
  }

  const slot =
    focus?.kind === 'slot' ? getSankeySlotDetail(focus.dateLabel, focus.timeLabel) : null;

  return (
    <Dialog open={focus !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 shadow-xl sm:max-w-2xl [&_[data-slot=dialog-close]]:text-slate-600">
        <DialogHeader>
          <DialogTitle className="text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-slate-600">{description}</DialogDescription>
        </DialogHeader>

        {focus?.kind === 'slot' && slot ? (
          <SlotDetailBody slot={slot} metric={focus.metric} />
        ) : focus?.kind === 'slot' && !slot ? (
          <p className="text-sm text-rose-600">找不到該時段 CSV 資料。</p>
        ) : null}

        {focus?.kind === 'period' ? (
          <PeriodDetailBody dateLabels={focus.dateLabels} metric={focus.metric} />
        ) : null}

        {focus?.kind === 'node' ? (
          <NodeEdgeBody dateLabels={focus.dateLabels} timeLabel={focus.timeLabel} nodeName={focus.nodeName} />
        ) : null}

        {focus?.kind === 'edge' ? (
          <NodeEdgeBody
            dateLabels={focus.dateLabels}
            timeLabel={focus.timeLabel}
            sourceNode={focus.sourceNode}
            targetNode={focus.targetNode}
          />
        ) : null}

        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
          資料來源：sankey_slots_15min_detail.csv、sankey_flows_15min.csv · 電號主檔 {assets.length} 筆
        </div>
      </DialogContent>
    </Dialog>
  );
}
