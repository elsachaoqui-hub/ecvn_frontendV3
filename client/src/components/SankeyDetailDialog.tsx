import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  aggregateSankeyFlows,
  aggregateSankeyFlowsByTimeSlot,
  formatSankeyAssetLabel,
  getSankeyAsset,
  getSankeyAssetsByType,
  getSankeyFlows,
  getSankeyFlowsForDates,
  getSankeySlotDetail,
  getSankeySlotDetailsForDates,
  loadSankeyExplorerDataset,
  type AggregatedFlowRow,
  type SankeyFlowRow,
  type SankeySlotDetailRow,
  type TimeSlotAggregatedFlowRow,
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
  /** 5.1 預結算以計畫／時段彙總；5.2 月結算保留電號層級明細 */
  variant?: 'pre' | 'monthly';
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

function FlowTable({ rows, showSlotCount }: { rows: AggregatedFlowRow[]; showSlotCount?: boolean }) {
  if (rows.length === 0) {
    return <p className="text-base text-slate-600">此範圍無對應流向紀錄。</p>;
  }
  return (
    <div className="max-h-[min(50vh,28rem)] overflow-auto rounded-lg border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="sticky top-0 bg-slate-100 text-slate-800">
          <tr>
            <th className="px-2 py-1.5 text-left font-bold">來源</th>
            <th className="px-2 py-1.5 text-left font-bold">來源電號／表號</th>
            <th className="px-2 py-1.5 text-center font-bold">→</th>
            <th className="px-2 py-1.5 text-left font-bold">去向</th>
            <th className="px-2 py-1.5 text-left font-bold">去向電號／表號</th>
            <th className="px-2 py-1.5 text-right font-bold">kWh</th>
            {showSlotCount ? <th className="px-2 py-1.5 text-right font-bold">時段數</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.sourceNode}-${r.targetNode}-${i}`} className="border-t border-slate-100 text-slate-900">
              <td className="px-2 py-1.5 font-semibold">{r.sourceNode}</td>
              <td className="px-2 py-1.5 text-slate-600">{formatSankeyAssetLabel(r.sourceAssetId)}</td>
              <td className="px-2 py-1.5 text-center text-indigo-600">→</td>
              <td className="px-2 py-1.5 font-semibold">{r.targetNode}</td>
              <td className="px-2 py-1.5 text-slate-600">{formatSankeyAssetLabel(r.targetAssetId)}</td>
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

/** 5.1 預結算：以 15 分鐘時段為主的節點彙總流向 */
function TimeFlowTable({ rows }: { rows: TimeSlotAggregatedFlowRow[] }) {
  if (rows.length === 0) {
    return <p className="text-base text-slate-600">此範圍無對應流向紀錄。</p>;
  }
  return (
    <div className="max-h-[min(50vh,28rem)] overflow-auto rounded-lg border border-slate-200">
      <table className="w-full table-auto text-sm">
        <thead className="sticky top-0 bg-slate-100 text-slate-800">
          <tr>
            <th className="px-2 py-1 text-left font-bold whitespace-nowrap">時間（15 分鐘）</th>
            <th className="px-2 py-1 text-left font-bold">去向（節點彙總）</th>
            <th className="px-2 py-1 text-right font-bold whitespace-nowrap">kWh</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={`${r.dateLabel}-${r.timeLabel}-${r.sourceNode}-${r.targetNode}-${i}`}
              className="border-t border-slate-100 text-slate-900"
            >
              <td className="px-2 py-1 font-mono font-semibold whitespace-nowrap">
                {r.dateLabel} {r.timeLabel}
              </td>
              <td className="px-2 py-1">
                <span className="font-semibold">{r.sourceNode}</span>
                <span className="mx-1 text-slate-400">→</span>
                <span className="font-semibold">{r.targetNode}</span>
              </td>
              <td className="px-2 py-1 text-right tabular-nums font-bold whitespace-nowrap">{r.flowKwh.toFixed(3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreSettlementTimeSlotSummary({
  slots,
  metric,
}: {
  slots: SankeySlotDetailRow[];
  metric: SankeyMetricFocus;
}) {
  const showGen = metric === 'generation' || metric === 'all';
  const showLoad = metric === 'load' || metric === 'all';
  const showStorage = metric === 'balance' || metric === 'storageIn' || metric === 'storageOut' || metric === 'all';

  if (!showGen && !showLoad && !showStorage) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {showGen ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
          <p className="text-xs font-bold text-amber-900">發電端各時段彙總產生（kWh）</p>
          <div className="mt-2 max-h-40 overflow-auto text-xs">
            {slots.map((s) => (
              <div key={`${s.dateLabel}-${s.timeLabel}-gen`} className="flex justify-between gap-2 border-t border-amber-100 py-1 first:border-0">
                <span className="font-mono font-semibold text-slate-800">
                  {s.dateLabel} {s.timeLabel}
                </span>
                <span className="tabular-nums font-bold text-amber-900">{s.generationTotalKwh.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {showLoad ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
          <p className="text-xs font-bold text-blue-900">用電端各時段可分配（kWh）</p>
          <div className="mt-2 max-h-40 overflow-auto text-xs">
            {slots.map((s) => (
              <div key={`${s.dateLabel}-${s.timeLabel}-load`} className="flex justify-between gap-2 border-t border-blue-100 py-1 first:border-0">
                <span className="font-mono font-semibold text-slate-800">
                  {s.dateLabel} {s.timeLabel}
                </span>
                <span className="tabular-nums font-bold text-blue-900">{s.loadTotalKwh.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      {showStorage ? (
        <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3 sm:col-span-2">
          <p className="text-xs font-bold text-teal-900">儲能餘額（各時段末，kWh）</p>
          <div className="mt-2 max-h-32 overflow-auto text-xs">
            {slots.map((s) => (
              <div key={`${s.dateLabel}-${s.timeLabel}-sto`} className="flex justify-between gap-2 border-t border-teal-100 py-1 first:border-0">
                <span className="font-mono font-semibold text-slate-800">
                  {s.dateLabel} {s.timeLabel}
                </span>
                <span className="tabular-nums font-bold text-teal-900">{s.endStorageBalanceKwh.toFixed(3)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
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
      <table className="mt-2 min-w-full text-sm">
        <thead>
          <tr className="text-slate-600">
            <th className="py-1 text-left font-bold">電號</th>
            <th className="py-1 text-left font-bold">場站</th>
            <th className="py-1 text-left font-bold">表號</th>
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
                <td className="py-1 font-mono text-slate-600">{asset?.meterNumber || '—'}</td>
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
        <div key={name} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm">
          <span className="font-bold text-slate-700">{name}</span>
          <span className="ml-2 tabular-nums font-black text-indigo-800">{value.toFixed(3)} kWh</span>
        </div>
      ))}
    </div>
  );
}

function aggregateFlowKwhBySourceAsset(flows: SankeyFlowRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const f of flows) {
    if (!f.sourceAssetId) continue;
    map[f.sourceAssetId] = Number(((map[f.sourceAssetId] ?? 0) + f.flowKwh).toFixed(3));
  }
  return map;
}

function aggregateFlowKwhByTargetAsset(flows: SankeyFlowRow[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const f of flows) {
    if (!f.targetAssetId) continue;
    map[f.targetAssetId] = Number(((map[f.targetAssetId] ?? 0) + f.flowKwh).toFixed(3));
  }
  return map;
}

function filterFlowsForMetric(flows: SankeyFlowRow[], metric: SankeyMetricFocus): SankeyFlowRow[] {
  switch (metric) {
    case 'generation':
      return flows.filter((f) => f.sourceNode === '發電端');
    case 'load':
      return flows.filter((f) => f.targetNode === '用電端' || f.sourceNode === '用電端');
    case 'storageIn':
      return flows.filter(
        (f) =>
          f.flowType === 'generation_storage' ||
          f.flowType === 'storage_deposit' ||
          f.targetNode === '儲能存入' ||
          (f.targetNode === '儲能' && f.flowType !== 'balance_storage')
      );
    case 'storageOut':
      return flows.filter(
        (f) =>
          f.flowType === 'storage_to_load' ||
          f.flowType === 'storage_deposit' ||
          (f.sourceNode === '儲能' && (f.targetNode === '用電端' || f.targetNode === '儲能存入'))
      );
    case 'contract':
      return flows.filter((f) => f.sourceNode === '合約數量' || f.targetNode === '合約數量');
    case 'total':
      return flows.filter((f) => f.targetNode === '成功匹配');
    case 'balance':
      return flows.filter((f) => f.sourceNode === '儲能餘額' || f.targetNode === '儲能餘額');
    default:
      return flows;
  }
}

function SlotDetailBody({
  slot,
  metric,
  preMode,
}: {
  slot: SankeySlotDetailRow;
  metric: SankeyMetricFocus;
  preMode: boolean;
}) {
  const flows = filterFlowsForMetric(getSankeyFlows(slot.dateLabel, slot.timeLabel), metric);
  const agg = aggregateSankeyFlows(flows);
  const timeFlows = aggregateSankeyFlowsByTimeSlot(flows);

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
        {preMode ? (
          <p className="mt-1 text-xs text-indigo-700">
            預結算以計畫為單位申報，本時段僅顯示節點彙總；各電號拆分屬 MVRN 範疇。
          </p>
        ) : null}
      </div>

      {preMode ? (
        <>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <p>
              發電端彙總 <span className="font-bold tabular-nums">{slot.generationTotalKwh.toFixed(3)}</span> kWh ·
              用電端可分配{' '}
              <span className="font-bold tabular-nums">{slot.loadTotalKwh.toFixed(3)}</span> kWh · 儲能餘額（時段末）{' '}
              <span className="font-bold tabular-nums">{slot.endStorageBalanceKwh.toFixed(3)}</span> kWh
            </p>
          </div>
          {metric === 'storageIn' ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-900">
              <p className="font-bold">本時段儲能調節帳戶流入（+）</p>
              <p className="mt-1 tabular-nums font-semibold">{slot.storageChargeKwh.toFixed(3)} kWh</p>
            </div>
          ) : null}
          {metric === 'storageOut' ? (
            <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-sm text-violet-900">
              <p className="font-bold">本時段儲能提領（-）</p>
              <p className="mt-1 tabular-nums font-semibold">{slot.storageDischargeKwh.toFixed(3)} kWh</p>
            </div>
          ) : null}
          {metric === 'balance' ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50/40 p-3 text-xs">
              <p className="font-bold text-teal-900">儲能餘額</p>
              <p className="mt-1 tabular-nums">
                時段初 {slot.prevStorageBalanceKwh.toFixed(3)} → 時段末 {slot.endStorageBalanceKwh.toFixed(3)} kWh
              </p>
            </div>
          ) : null}
          {metric === 'contract' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <p>
                合約匹配量{' '}
                <span className="font-bold tabular-nums">{slot.contractMatchedKwh.toFixed(3)}</span> kWh（節點彙總）
              </p>
            </div>
          ) : null}
          {metric === 'total' ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
              <p>
                總匹配量 <span className="font-bold tabular-nums">{slot.transferSuccessKwh.toFixed(3)}</span> kWh（節點彙總）
              </p>
            </div>
          ) : null}
          {metric === 'all' ? <SlotSummary slot={slot} /> : null}
          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">電力流向（時段 → 節點彙總）</p>
            <TimeFlowTable rows={timeFlows} />
          </div>
        </>
      ) : null}

      {!preMode && (metric === 'generation' || metric === 'all') && (
        <AssetKwTable
          title="發電電號 G1～G5（kW / kWh）"
          ids={GEN_IDS}
          kw={slot.generationByAssetKw}
          kwh={slot.generationByAssetKwh}
          unit="kWh"
        />
      )}

      {!preMode && (metric === 'load' || metric === 'all') && (
        <AssetKwTable
          title="負載電號 L1～L5（kW / kWh）"
          ids={LOAD_IDS}
          kw={slot.loadByAssetKw}
          kwh={slot.loadByAssetKwh}
          unit="kWh"
        />
      )}

      {!preMode && (metric === 'balance' || metric === 'all') && (
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

      {!preMode && metric === 'storageIn' && (
        <>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 px-3 py-2 text-sm text-emerald-900">
            <p className="font-bold">本時段儲能存入（+）</p>
            <p className="mt-1 tabular-nums font-semibold">{slot.storageChargeKwh.toFixed(3)} kWh</p>
          </div>
          <AssetKwTable
            title="發電電號 → 儲能（流向依 G1～G5 加總 kWh）"
            ids={GEN_IDS}
            kw={Object.fromEntries(GEN_IDS.map((id) => [id, 0]))}
            kwh={aggregateFlowKwhBySourceAsset(flows)}
            unit="kWh"
          />
        </>
      )}

      {!preMode && metric === 'storageOut' && (
        <>
          <div className="rounded-lg border border-violet-200 bg-violet-50/50 px-3 py-2 text-sm text-violet-900">
            <p className="font-bold">本時段儲能提領（-）</p>
            <p className="mt-1 tabular-nums font-semibold">{slot.storageDischargeKwh.toFixed(3)} kWh</p>
          </div>
          <AssetKwTable
            title="發電電號經儲能轉出（來源電號加總 kWh）"
            ids={GEN_IDS}
            kw={Object.fromEntries(GEN_IDS.map((id) => [id, 0]))}
            kwh={aggregateFlowKwhBySourceAsset(flows)}
            unit="kWh"
          />
          <AssetKwTable
            title="負載電號接收提領匹配（去向電號加總 kWh）"
            ids={LOAD_IDS}
            kw={Object.fromEntries(LOAD_IDS.map((id) => [id, 0]))}
            kwh={aggregateFlowKwhByTargetAsset(flows)}
            unit="kWh"
          />
        </>
      )}

      {!preMode && metric === 'all' && <SlotSummary slot={slot} />}

      {!preMode ? (
        <div>
          <p className="mb-2 text-xs font-bold text-slate-700">電力流向（來源 → 去向）</p>
          <FlowTable rows={agg} />
        </div>
      ) : null}
    </div>
  );
}

function PeriodDetailBody({
  dateLabels,
  metric,
  preMode,
}: {
  dateLabels: string[];
  metric: SankeyMetricFocus;
  preMode: boolean;
}) {
  const flows = filterFlowsForMetric(getSankeyFlowsForDates(dateLabels), metric);
  const agg = aggregateSankeyFlows(flows);
  const timeFlows = aggregateSankeyFlowsByTimeSlot(flows);
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
  const sumStorageIn = slots.reduce((s, r) => s + r.storageChargeKwh, 0);
  const sumStorageOut = slots.reduce((s, r) => s + r.storageDischargeKwh, 0);
  const storageInByGen = aggregateFlowKwhBySourceAsset(
    filterFlowsForMetric(getSankeyFlowsForDates(dateLabels), 'storageIn')
  );
  const storageOutByGen = aggregateFlowKwhBySourceAsset(flows);
  const storageOutByLoad = aggregateFlowKwhByTargetAsset(flows);

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
        {(metric === 'storageIn' || metric === 'storageOut') && (
          <p className="mt-1 font-semibold text-slate-800">
            儲能存入 {sumStorageIn.toFixed(1)} kWh · 儲能提領 {sumStorageOut.toFixed(1)} kWh（15 分鐘明細加總）
          </p>
        )}
        {preMode ? (
          <p className="mt-1 text-indigo-800">
            代理人以計畫為單位打包申報；預結算僅能檢視各 15 分鐘時段之節點彙總，無法得知各發電／用電電號拆分（MVRN 範疇）。
          </p>
        ) : null}
      </div>

      {preMode ? (
        <>
          <PreSettlementTimeSlotSummary slots={slots} metric={metric} />
          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">區間流向（依 15 分鐘時段 × 節點彙總）</p>
            <TimeFlowTable rows={timeFlows} />
          </div>
        </>
      ) : null}

      {!preMode && (metric === 'generation' || metric === 'all') && (
        <AssetKwTable
          title="發電電號加總（kWh）"
          ids={GEN_IDS}
          kw={Object.fromEntries(GEN_IDS.map((id) => [id, 0]))}
          kwh={genByAsset}
          unit="kWh 加總"
        />
      )}

      {!preMode && (metric === 'load' || metric === 'all') && (
        <AssetKwTable
          title="負載電號加總（kWh）"
          ids={LOAD_IDS}
          kw={Object.fromEntries(LOAD_IDS.map((id) => [id, 0]))}
          kwh={loadByAsset}
          unit="kWh 加總"
        />
      )}

      {!preMode && metric === 'storageIn' && (
        <AssetKwTable
          title="發電電號 → 儲能（區間流向依 G1～G5 加總 kWh）"
          ids={GEN_IDS}
          kw={Object.fromEntries(GEN_IDS.map((id) => [id, 0]))}
          kwh={storageInByGen}
          unit="kWh 加總"
        />
      )}

      {!preMode && metric === 'storageOut' && (
        <>
          <AssetKwTable
            title="儲能提領 · 來源電號加總（kWh）"
            ids={GEN_IDS}
            kw={Object.fromEntries(GEN_IDS.map((id) => [id, 0]))}
            kwh={storageOutByGen}
            unit="kWh 加總"
          />
          <AssetKwTable
            title="儲能提領 · 負載電號接收加總（kWh）"
            ids={LOAD_IDS}
            kw={Object.fromEntries(LOAD_IDS.map((id) => [id, 0]))}
            kwh={storageOutByLoad}
            unit="kWh 加總"
          />
        </>
      )}

      {!preMode ? (
        <div>
          <p className="mb-2 text-xs font-bold text-slate-700">區間流向加總（依來源／去向／電號合併）</p>
          <FlowTable rows={agg} showSlotCount />
        </div>
      ) : null}
    </div>
  );
}

function NodeEdgeBody({
  dateLabels,
  timeLabel,
  nodeName,
  sourceNode,
  targetNode,
  preMode,
}: {
  dateLabels: string[];
  timeLabel?: string;
  nodeName?: string;
  sourceNode?: string;
  targetNode?: string;
  preMode: boolean;
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
  const timeFlows = aggregateSankeyFlowsByTimeSlot(flows);
  const total = (preMode ? timeFlows : agg).reduce((s, r) => s + r.flowKwh, 0);

  return (
    <div className="grid gap-3">
      <p className="text-sm font-semibold text-slate-800">
        流量加總 <span className="tabular-nums text-indigo-800">{total.toFixed(3)} kWh</span>
        {timeLabel ? ` · 時段 ${timeLabel}` : ` · ${dateLabels.length} 日彙總`}
        {preMode ? <span className="text-slate-500"> · 節點彙總（不含電號拆分）</span> : null}
      </p>
      {preMode ? (
        <TimeFlowTable rows={timeFlows} />
      ) : (
        <FlowTable rows={agg} showSlotCount={!timeLabel} />
      )}
    </div>
  );
}

function CollapsibleAssetRegistry({ assetCount }: { assetCount: number }) {
  const [open, setOpen] = useState(false);
  const registryAssets = [
    ...getSankeyAssetsByType('generation'),
    ...getSankeyAssetsByType('load'),
  ];

  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 text-ui-10 text-slate-600">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-100/80"
        aria-expanded={open}
      >
        <span className="font-bold text-slate-700">
          電號主檔（sankey_asset_registry.csv）
          <span className="ml-1 font-normal text-slate-500">· 共 {assetCount} 筆</span>
        </span>
        <span className="shrink-0 text-xs font-bold text-indigo-700">
          {open ? '▼ 收合' : '▶ 展開'}
        </span>
      </button>
      {open ? (
        <div className="border-t border-slate-200 px-3 pb-2 pt-2">
          <div className="max-h-40 overflow-auto rounded-md border border-slate-200 bg-white">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-slate-100">
                <tr className="text-slate-500">
                  <th className="px-2 py-1 text-left font-bold">電號</th>
                  <th className="px-2 py-1 text-left font-bold">場站</th>
                  <th className="px-2 py-1 text-left font-bold">表號</th>
                  <th className="px-2 py-1 text-left font-bold">類型</th>
                </tr>
              </thead>
              <tbody>
                {registryAssets.map((a) => (
                  <tr key={a.assetId} className="border-t border-slate-100 text-slate-800">
                    <td className="px-2 py-1 font-bold">{a.assetId}</td>
                    <td className="px-2 py-1">{a.siteName}</td>
                    <td className="px-2 py-1 font-mono">{a.meterNumber}</td>
                    <td className="px-2 py-1">{a.resourceType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-slate-500">
            數值來源：sankey_slots_15min_detail.csv、sankey_flows_15min.csv
          </p>
        </div>
      ) : null}
    </div>
  );
}

function assetRegistryFocusKey(focus: SankeyDetailFocus): string {
  switch (focus.kind) {
    case 'slot':
      return `slot-${focus.dateLabel}-${focus.timeLabel}-${focus.metric}`;
    case 'period':
      return `period-${focus.metric}-${focus.dateLabels.join('|')}`;
    case 'node':
      return `node-${focus.nodeName}-${focus.dateLabels.join('|')}`;
    case 'edge':
      return `edge-${focus.sourceNode}-${focus.targetNode}-${focus.dateLabels.join('|')}`;
  }
}

export default function SankeyDetailDialog({ focus, onClose, variant = 'monthly' }: SankeyDetailDialogProps) {
  const assets = loadSankeyExplorerDataset().assets;
  const preMode = variant === 'pre';

  let title = '桑基明細';
  let description = '';

  if (focus?.kind === 'slot') {
    title = `${METRIC_LABEL[focus.metric]} · ${focus.timeLabel}`;
    description = preMode
      ? `${focus.periodLabel} — 15 分鐘時段明細（計畫層級節點彙總）`
      : `${focus.periodLabel} — 15 分鐘時段明細（含 G1～G5、L1～L5 與流向）`;
  } else if (focus?.kind === 'period') {
    title = `${METRIC_LABEL[focus.metric]} · 區間加總`;
    description = preMode
      ? `${focus.periodLabel} — ${focus.dateLabels.length} 日 · 依 15 分鐘時段之節點彙總流向`
      : `${focus.periodLabel} — ${focus.dateLabels.length} 日資料組成明細`;
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

  const dialogWidthClass = preMode
    ? 'w-fit max-w-[min(96vw,40rem)] sm:max-w-2xl'
    : 'w-[min(96vw,64rem)] max-w-[calc(100%-2rem)] sm:max-w-5xl';

  return (
    <Dialog open={focus !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className={`max-h-[90vh] overflow-y-auto border-slate-200 bg-white text-slate-900 shadow-xl [&_[data-slot=dialog-close]]:text-slate-600 ${dialogWidthClass}`}
      >
        <DialogHeader>
          <DialogTitle className="text-slate-900">{title}</DialogTitle>
          <DialogDescription className="text-slate-600">{description}</DialogDescription>
        </DialogHeader>

        {focus?.kind === 'slot' && slot ? (
          <SlotDetailBody slot={slot} metric={focus.metric} preMode={preMode} />
        ) : focus?.kind === 'slot' && !slot ? (
          <p className="text-sm text-rose-600">找不到該時段 CSV 資料。</p>
        ) : null}

        {focus?.kind === 'period' ? (
          <PeriodDetailBody dateLabels={focus.dateLabels} metric={focus.metric} preMode={preMode} />
        ) : null}

        {focus?.kind === 'node' ? (
          <NodeEdgeBody
            dateLabels={focus.dateLabels}
            timeLabel={focus.timeLabel}
            nodeName={focus.nodeName}
            preMode={preMode}
          />
        ) : null}

        {focus?.kind === 'edge' ? (
          <NodeEdgeBody
            dateLabels={focus.dateLabels}
            timeLabel={focus.timeLabel}
            sourceNode={focus.sourceNode}
            targetNode={focus.targetNode}
            preMode={preMode}
          />
        ) : null}

        {focus ? (
          <CollapsibleAssetRegistry key={assetRegistryFocusKey(focus)} assetCount={assets.length} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
