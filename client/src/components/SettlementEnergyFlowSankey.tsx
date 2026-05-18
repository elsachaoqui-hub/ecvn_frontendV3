import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

export type EnergyFlowDrill = 'year' | 'month' | 'day';

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

function buildScaledLinks(a: EnergyFlowAggregate) {
  const k = Math.max(a.generation / TEMPLATE_GEN, 0.05);
  const genToContract = Number(Math.max(a.contractMatched * 1.02, 650 * k).toFixed(1));
  const genToStorage = Number(Math.max(a.storageIn, 230 * k).toFixed(1));
  const genToSurplus = Number(Math.max(120 * k, a.generation - genToContract - genToStorage * 0.4).toFixed(1));
  const balanceToStorage = Number(Math.max(150 * k, a.storageIn * 0.55).toFixed(1));
  const contractToLoad = Number(Math.min(640 * k, a.load * 0.92, genToContract).toFixed(1));
  const contractToSurplus = Number(Math.max(10 * k, genToContract - contractToLoad).toFixed(1));
  const storageToTransfer = Number(Math.max(a.storageOut, 250 * k).toFixed(1));
  const storageToDeposit = Number(Math.max(130 * k, a.storageIn * 0.48).toFixed(1));
  const loadToSuccess = Number(Math.min(620 * k, a.totalMatched * 0.68).toFixed(1));
  const loadToSurplus = Number(Math.max(20 * k, a.load - loadToSuccess).toFixed(1));
  const transferToSuccess = Number(Math.min(235 * k, a.totalMatched - loadToSuccess, storageToTransfer).toFixed(1));
  const transferToSurplus = Number(Math.max(15 * k, storageToTransfer - transferToSuccess).toFixed(1));

  return {
    genToContract,
    genToStorage,
    genToSurplus,
    balanceToStorage,
    contractToLoad,
    contractToSurplus,
    storageToTransfer,
    storageToDeposit,
    loadToSuccess,
    loadToSurplus,
    transferToSuccess,
    transferToSurplus,
  };
}

type SettlementEnergyFlowSankeyProps = {
  drill: EnergyFlowDrill;
  aggregate: EnergyFlowAggregate;
  embedded?: boolean;
};

export default function SettlementEnergyFlowSankey({
  drill,
  aggregate,
  embedded = false,
}: SettlementEnergyFlowSankeyProps) {
  const [enlarge, setEnlarge] = useState(false);
  const [paletteMode, setPaletteMode] = useState<'A' | 'B'>('A');
  const [activeNode, setActiveNode] = useState<string | null>('發電端');

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
        };

  const drillTitle =
    drill === 'year' ? '年度彙總' : drill === 'month' ? '月份彙總' : '單日彙總';

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

    const f = buildScaledLinks(aggregate);

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

    const links = [
      { source: '發電端', target: '合約數量', value: f.genToContract },
      { source: '發電端', target: '儲能', value: f.genToStorage },
      { source: '發電端', target: '餘電', value: f.genToSurplus },
      { source: '儲能餘額', target: '儲能', value: f.balanceToStorage },
      { source: '合約數量', target: '用電端', value: f.contractToLoad },
      { source: '合約數量', target: '餘電', value: f.contractToSurplus },
      { source: '儲能', target: '用電端轉移量', value: f.storageToTransfer },
      { source: '儲能', target: '儲能存入量', value: f.storageToDeposit },
      { source: '用電端', target: '成功匹配量', value: f.loadToSuccess },
      { source: '用電端', target: '餘電', value: f.loadToSurplus },
      { source: '用電端轉移量', target: '成功匹配量', value: f.transferToSuccess },
      { source: '用電端轉移量', target: '餘電', value: f.transferToSurplus },
    ].filter((l) => l.value > 0.05);

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
          emphasis: { focus: 'adjacency', lineStyle: { color: 'gradient', opacity: 0.88 } },
          draggable: true,
          roam: true,
          lineStyle: { color: 'gradient', curveness: 0.32, opacity: 0.62 },
          label: labelCommon,
          data: nodes,
          links,
        },
      ],
    };
  }, [aggregate, enlarge, palette]);

  const chartEvents = {
    click: (params: unknown) => {
      const node = params as { dataType?: string; name?: string };
      if (node.dataType === 'node' && node.name) setActiveNode(node.name);
    },
  };

  return (
    <section
      className={embedded ? 'mt-6' : 'rounded-2xl border border-slate-300 p-5 shadow-sm'}
      style={embedded ? undefined : { backgroundColor: palette.background, color: palette.text }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">4.2 月結算｜能源流動總覽（桑基）</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
            依下方明細表下鑽層級自動切換：<strong>{drillTitle}</strong>（{aggregate.periodLabel}，共{' '}
            {aggregate.dayCount} 日）。數值由示範資料加總後依月結算節點比例換算，圖表可拖曳縮放。
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

      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold text-slate-700">
        <span className="rounded-full bg-indigo-100 px-2.5 py-1 text-indigo-900">發電 {aggregate.generation.toFixed(1)}</span>
        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-900">用電 {aggregate.load.toFixed(1)}</span>
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-violet-900">儲能存入 {aggregate.storageIn.toFixed(1)}</span>
        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-900">匹配 {aggregate.totalMatched.toFixed(1)}</span>
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
        <p className="text-xs font-bold text-slate-600">可點擊節點檢視摘要（目前層級：{drillTitle}）</p>
        {activeNode ? (
          <div className="mt-2 grid gap-2 text-sm font-semibold text-slate-800 sm:grid-cols-2">
            <p>
              節點：<span className="text-indigo-800">{activeNode}</span>
            </p>
            <p>
              區間加總：發電 {aggregate.generation.toFixed(1)} kWh／用電 {aggregate.load.toFixed(1)} kWh
            </p>
            <p>合約匹配 {aggregate.contractMatched.toFixed(1)} kWh</p>
            <p>總匹配 {aggregate.totalMatched.toFixed(1)} kWh（{aggregate.dayCount} 日）</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">請點選圖上節點。</p>
        )}
      </div>
    </section>
  );
}