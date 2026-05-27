import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

import { useUiFont } from '@/contexts/UiFontContext';
import {
  SANKEY_CHART_NODES,
  summarizeSankeyNodeFlows,
  type SankeyChartLink,
} from '@/lib/sankeyExplorerCsv';

export type EnergyFlowDrill = 'year' | 'month' | 'day';

export type SankeyClickPayload =
  | { type: 'node'; name: string }
  | { type: 'edge'; source: string; target: string };

export type EnergyFlowAggregate = {
  generation: number;
  load: number;
  storageIn: number;
  storageOut: number;
  contractMatched: number;
  totalMatched: number;
  dayCount: number;
  periodLabel: string;
};

const TEMPLATE_GEN = 1000;

const PALETTE = {
  generation: '#f59e0b',
  contract: '#92400e',
  storage: '#7c3aed',
  battery: '#0f766e',
  success: '#059669',
  surplus: '#ea580c',
  text: '#0f172a',
  background: '#f8fafc',
} as const;

const NODE_COLORS: Record<string, string> = {
  發電端: PALETTE.generation,
  儲能餘額: PALETTE.battery,
  合約數量: PALETTE.contract,
  儲能: PALETTE.storage,
  用電端: PALETTE.contract,
  成功匹配: PALETTE.success,
  儲能存入: PALETTE.storage,
  未匹配: '#64748b',
  餘電: PALETTE.surplus,
};

/** 固定欄位：左→右 4 欄（0～3），避免右側留白 */
const NODE_DEPTH: Record<string, number> = {
  發電端: 0,
  儲能餘額: 0,
  合約數量: 1,
  儲能: 1,
  用電端: 2,
  成功匹配: 3,
  儲能存入: 3,
  未匹配: 3,
  餘電: 3,
};

const NODE_LABEL_LEFT = new Set(['成功匹配', '未匹配', '餘電', '儲能存入']);

function getNodeLabelPosition(name: string): 'left' | 'right' {
  if (NODE_LABEL_LEFT.has(name)) return 'left';
  return 'right';
}

function buildScaledLinks(a: EnergyFlowAggregate): SankeyChartLink[] {
  const k = Math.max(a.generation / TEMPLATE_GEN, 0.05);
  const genToContract = Number((a.generation * 0.8).toFixed(1));
  const genToStorage = Number(Math.max(a.storageIn, 230 * k).toFixed(1));
  const genToSurplus = Number(Math.max(120 * k, a.generation - genToContract - genToStorage * 0.4).toFixed(1));
  const balanceToStorage = Number(Math.max(150 * k, a.storageIn * 0.55).toFixed(1));
  const storageToDeposit = Number(Math.max(130 * k, a.storageIn * 0.48).toFixed(1));
  const storageInNode = genToStorage + balanceToStorage;
  const storageToLoad = Number(Math.max(0, storageInNode - storageToDeposit).toFixed(1));
  const contractToLoad = genToContract;
  const contractToSurplus = Number(Math.max(0, genToContract - contractToLoad).toFixed(1));
  const loadToSuccess = Number((contractToLoad + storageToLoad).toFixed(1));
  const rem = Math.max(0, Number((a.load - loadToSuccess).toFixed(1)));
  const loadToSurplus = Number(Math.min(contractToLoad * 0.1, rem).toFixed(1));
  const loadToUnmatched = Number((rem - loadToSurplus).toFixed(1));

  return [
    { source: '發電端', target: '合約數量', value: genToContract },
    { source: '發電端', target: '儲能', value: genToStorage },
    { source: '發電端', target: '餘電', value: genToSurplus },
    { source: '儲能餘額', target: '儲能', value: balanceToStorage },
    { source: '合約數量', target: '用電端', value: contractToLoad },
    { source: '合約數量', target: '餘電', value: contractToSurplus },
    { source: '儲能', target: '用電端', value: storageToLoad },
    { source: '儲能', target: '儲能存入', value: storageToDeposit },
    { source: '用電端', target: '成功匹配', value: loadToSuccess },
    { source: '用電端', target: '餘電', value: loadToSurplus },
    { source: '用電端', target: '未匹配', value: loadToUnmatched },
  ].filter((l) => l.value > 0.05);
}

type SettlementEnergyFlowSankeyProps = {
  drill: EnergyFlowDrill;
  aggregate: EnergyFlowAggregate;
  flowLinks?: SankeyChartLink[];
  embedded?: boolean;
  /** 區塊標題（5.1 預結算 / 5.2 月結算） */
  title?: string;
  onSankeyInteraction?: (payload: SankeyClickPayload) => void;
};

export default function SettlementEnergyFlowSankey({
  drill,
  aggregate,
  flowLinks,
  embedded = false,
  title = '5.2 結算｜能源流動總覽（桑基）',
  onSankeyInteraction,
}: SettlementEnergyFlowSankeyProps) {
  const { chartFonts } = useUiFont();
  const [enlarge, setEnlarge] = useState(false);
  const [activeNode, setActiveNode] = useState<string | null>('發電端');

  const drillTitle =
    drill === 'year' ? '年度彙總' : drill === 'month' ? '月份彙總' : '單日彙總';

  const resolvedLinks = useMemo(
    () => (flowLinks && flowLinks.length > 0 ? flowLinks : buildScaledLinks(aggregate)),
    [aggregate, flowLinks]
  );

  const usesCsv = flowLinks != null && flowLinks.length > 0;

  const activeNodeSummary = useMemo(() => {
    if (!activeNode) return null;
    return summarizeSankeyNodeFlows(resolvedLinks, activeNode);
  }, [activeNode, resolvedLinks]);

  const option = useMemo<EChartsOption>(() => {
    const edge = enlarge ? 28 : 20;
    const labelCommon = {
      color: PALETTE.text,
      fontSize: enlarge ? chartFonts.sankeyNodeEnlarge : chartFonts.sankeyNode,
      fontWeight: 700,
      lineHeight: 15,
      width: enlarge ? 96 : 72,
      distance: 4,
      overflow: 'breakAll' as const,
    };

    const usedNodes = new Set<string>();
    for (const link of resolvedLinks) {
      usedNodes.add(link.source);
      usedNodes.add(link.target);
    }

    const nodes = SANKEY_CHART_NODES.filter((name) => usedNodes.has(name)).map((name) => {
      const depth = NODE_DEPTH[name] ?? 0;
      const labelPosition = getNodeLabelPosition(name);
      return {
        name,
        depth,
        itemStyle: { color: NODE_COLORS[name] ?? PALETTE.contract },
        label: {
          ...labelCommon,
          position: labelPosition,
          distance: labelPosition === 'left' ? 8 : 6,
          align: labelPosition === 'left' ? ('right' as const) : ('left' as const),
        },
      };
    });

    const links = resolvedLinks.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.value,
    }));

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
            return `${source} → ${target}<br/>流量：${Number(value).toFixed(3)} kWh`;
          }
          const nodeName = item.name ?? '';
          const { inFlow, outFlow } = summarizeSankeyNodeFlows(resolvedLinks, nodeName);
          return `${nodeName}<br/>流入：${inFlow.toFixed(3)} kWh<br/>流出：${outFlow.toFixed(3)} kWh`;
        },
      },
      series: [
        {
          type: 'sankey',
          left: edge,
          right: edge,
          top: edge,
          bottom: edge,
          width: 'auto',
          height: 'auto',
          nodeWidth: 12,
          nodeGap: enlarge ? 28 : 22,
          nodeAlign: 'justify',
          layoutIterations: 48,
          emphasis: { focus: 'adjacency', lineStyle: { color: 'gradient', opacity: 0.88 } },
          draggable: true,
          roam: false,
          lineStyle: { color: 'gradient', curveness: 0.32, opacity: 0.62 },
          label: labelCommon,
          data: nodes,
          links,
        },
      ],
    };
  }, [chartFonts.sankeyNode, chartFonts.sankeyNodeEnlarge, enlarge, resolvedLinks]);

  const chartEvents = {
    click: (params: unknown) => {
      const item = params as {
        dataType?: string;
        name?: string;
        data?: { source?: string; target?: string };
      };
      if (item.dataType === 'node' && item.name) {
        setActiveNode(item.name);
        onSankeyInteraction?.({ type: 'node', name: item.name });
      } else if (item.dataType === 'edge' && item.data?.source && item.data?.target) {
        onSankeyInteraction?.({ type: 'edge', source: item.data.source, target: item.data.target });
      }
    },
  };

  return (
    <section
      className={embedded ? 'mt-6' : 'rounded-2xl border border-slate-300 p-5 shadow-sm'}
      style={embedded ? undefined : { backgroundColor: PALETTE.background, color: PALETTE.text }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
            依下方明細表下鑽層級自動切換：<strong>{drillTitle}</strong>（{aggregate.periodLabel}，共{' '}
            {aggregate.dayCount} 日）。
            {usesCsv
              ? '節點與連線流量直接來自 CSV 流向加總，與表格同層級。'
              : '數值由示範資料加總後依比例換算。'}
            圖表可拖曳縮放。
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnlarge((v) => !v)}
          className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700"
        >
          {enlarge ? '縮小圖表' : '放大圖表'}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-900">發電 {aggregate.generation.toFixed(1)}</span>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">用電 {aggregate.load.toFixed(1)}</span>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-900">儲能存入 {aggregate.storageIn.toFixed(1)}</span>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">匹配 {aggregate.totalMatched.toFixed(1)}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] font-black text-slate-600 sm:grid-cols-5 sm:text-xs">
        <span className="rounded-md bg-amber-50 py-1 text-amber-900">① 發電端／儲能餘額</span>
        <span className="rounded-md bg-indigo-50 py-1 text-indigo-900">② 合約數量／儲能</span>
        <span className="rounded-md bg-blue-50 py-1 text-blue-900">③ 用電端</span>
        <span className="rounded-md bg-emerald-50 py-1 text-emerald-900 sm:col-span-2">④ 成功匹配／存入／未匹配／餘電</span>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-2">
        <div className={`w-full ${enlarge ? 'h-[620px]' : 'h-[520px]'}`}>
          <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} onEvents={chartEvents} />
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-bold text-slate-600">
          可點擊節點或連線開啟明細視窗（目前層級：{drillTitle}）
        </p>
        {activeNode && activeNodeSummary ? (
          <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-800 sm:grid-cols-2">
            <p>
              節點：<span className="text-indigo-800">{activeNode}</span>
            </p>
            <p>
              流入 {activeNodeSummary.inFlow.toFixed(3)} kWh／流出 {activeNodeSummary.outFlow.toFixed(3)} kWh
            </p>
            <p>
              區間加總：發電 {aggregate.generation.toFixed(1)} kWh／用電 {aggregate.load.toFixed(1)} kWh
            </p>
            <p>合約匹配 {aggregate.contractMatched.toFixed(1)} kWh · 總匹配 {aggregate.totalMatched.toFixed(1)} kWh</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">請點選圖上節點。</p>
        )}
      </div>
    </section>
  );
}
