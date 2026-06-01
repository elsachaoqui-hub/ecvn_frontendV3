import { useRegistration } from '@/contexts/RegistrationContext';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { amiLabels as L } from '@/lib/amiPowerLabels';
import {
  AMI_LAG_HOURS,
  buildDailySeries,
  buildHistoryCsvRows,
  buildIngestionStatus,
  buildMeterDetail,
  downloadCsv,
  formatClock,
  formatDateTime,
  isWeekend,
  parseLocalDate,
  toLocalDateInputValue,
  type DailyPoint,
  type MeterDetail,
  type MeterKind,
} from '@/lib/amiPowerModel';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

import type { Agent } from '@/data/agentAggregation';

const ALL_AGENTS_ID = '__all__';

function buildDailyChartOption(
  title: string,
  points: DailyPoint[],
  holiday: boolean,
  color: string,
  areaColor: string
): EChartsOption {
  const patternLabel = holiday ? L.chartHoliday : L.chartWeekday;

  return {
    animation: false,
    title: { text: title, left: 8, top: 4, textStyle: { fontSize: 13, fontWeight: 700, color: '#0f172a' } },
    grid: { top: 40, right: 16, bottom: 40, left: 48 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as {
          seriesName?: string;
          value?: number | null | string;
          axisValue?: string;
          dataIndex?: number;
        }[];
        const axis = list[0]?.axisValue ?? '';
        const idx = list[0]?.dataIndex ?? 0;
        const pt = points[idx];
        const coverage =
          pt && pt.meterTotal > 0
            ? `<br/>${L.chartPartial}: ${pt.metersInSystem}/${pt.meterTotal}`
            : '';
        const lines = list.map((p) => {
          const v = p.value;
          const text = v === null || v === undefined || v === '-' ? L.chartNotIn : `${Number(v).toFixed(1)} kWh`;
          return `${p.seriesName}: ${text}`;
        });
        return [axis, ...lines, coverage].filter(Boolean).join('<br/>');
      },
    },
    legend: { top: 8, right: 8, textStyle: { fontSize: 11 } },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: points.map((p) => p.label),
      axisLabel: { color: '#64748b', fontSize: 10, interval: 2 },
    },
    yAxis: {
      type: 'value',
      name: 'kWh',
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { lineStyle: { color: '#e2e8f0', type: 'dashed' } },
    },
    series: [
      {
        name: L.chartInSystem,
        type: 'line',
        smooth: true,
        connectNulls: false,
        showSymbol: false,
        lineStyle: { width: 2.5, color },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: areaColor },
              { offset: 1, color: 'rgba(148,163,184,0.05)' },
            ],
          },
        },
        data: points.map((p) => (p.actual === null ? null : p.actual)),
      },
      {
        name: patternLabel,
        type: 'line',
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, type: 'dashed', color: '#94a3b8' },
        itemStyle: { color: '#94a3b8' },
        data: points.map((p) => p.reference),
      },
    ],
  };
}

function MeterTable({
  title,
  subtitle,
  meters,
  kind,
  isViewingToday,
  showAgentColumn,
}: {
  title: string;
  subtitle: string;
  meters: MeterDetail[];
  kind: MeterKind;
  isViewingToday: boolean;
  showAgentColumn?: boolean;
}) {
  const totalKwh = meters.reduce((s, m) => s + m.systemKwh, 0);
  const roundedTotal = Math.round(totalKwh * 10) / 10;
  const sideLabel = kind === 'generation' ? L.genSide : L.loadSide;
  const emptyLabel = kind === 'generation' ? L.gen : L.load;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">{subtitle}</p>
          <h2 className="mt-1 text-xl font-bold text-slate-900">{title}</h2>
          <p className="mt-1 text-sm text-slate-600">
            {L.meterCountPrefix}{' '}
            <span className="font-bold text-slate-900">{meters.length}</span> {L.meterCountSuffix}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-bold ${
            kind === 'generation' ? 'bg-emerald-100 text-emerald-800' : 'bg-sky-100 text-sky-800'
          }`}
        >
          {sideLabel}
        </span>
      </div>
      <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              {showAgentColumn ? <th className="px-4 py-3">{L.colAgent}</th> : null}
              <th className="px-4 py-3">{L.colMeter}</th>
              <th className="px-4 py-3">{L.colKwh}</th>
              <th className="px-4 py-3">{L.colInterval}</th>
              <th className="px-4 py-3">{L.colIngest}</th>
              <th className="px-4 py-3">{L.colLag}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {meters.map((m) => (
              <tr key={m.rowKey} className="hover:bg-slate-50">
                {showAgentColumn ? (
                  <td className="px-4 py-3 text-sm font-semibold text-slate-700">{m.agentName ?? '?'}</td>
                ) : null}
                <td className="px-4 py-3">
                  <p className="font-bold text-slate-900">{m.meterNo}</p>
                  <p className="text-slate-600">{m.siteName}</p>
                  <p className="text-xs text-slate-400">{m.extra}</p>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-900">{m.systemKwh} kWh</td>
                <td className="px-4 py-3 font-mono font-bold text-slate-800">{m.intervalLabel}</td>
                <td className="px-4 py-3 text-slate-600">{formatDateTime(m.ingestedAt)}</td>
                <td className="px-4 py-3">
                  {m.lagHours !== null ? (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-800">
                      {L.lagAbout} {m.lagHours.toFixed(1)} {L.lagUnit}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">{L.historyRow}</span>
                  )}
                </td>
              </tr>
            ))}
            {meters.length === 0 && (
              <tr>
                <td colSpan={showAgentColumn ? 6 : 5} className="px-4 py-8 text-center text-slate-500">
                  {L.noMeter}
                  {emptyLabel}
                  {L.noMeterSuffix}
                </td>
              </tr>
            )}
          </tbody>
          {meters.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="px-4 py-3 font-bold text-slate-900">{L.total}</td>
                <td className="px-4 py-3 font-bold text-slate-900">{roundedTotal} kWh</td>
                {showAgentColumn ? <td className="px-4 py-3" /> : null}
                <td className="px-4 py-3 text-xs text-slate-500" colSpan={3}>
                  {isViewingToday ? L.footToday : L.footHistory}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

export default function DashboardRealTimeAmiPower() {
  const { agents } = useRegistration();
  const todayStr = useMemo(() => toLocalDateInputValue(), []);
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() => String(agents[0]?.id ?? ''));
  const [viewDate, setViewDate] = useState(todayStr);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState(() => new Date());
  const [refreshSeq, setRefreshSeq] = useState(0);

  const isViewingToday = viewDate === todayStr;
  const isAllAgents = selectedAgentId === ALL_AGENTS_ID;

  const viewScope = useMemo((): Agent | null => {
    if (agents.length === 0) return null;
    if (isAllAgents) {
      return {
        id: 0,
        name: L.allAgents,
        taxId: '',
        registrationType: '',
        genCap: 0,
        loadCap: 0,
        storageCap: 0,
        genMeters: 0,
        loadMeters: 0,
        bessCount: 0,
        genList: agents.flatMap((a) => a.genList),
        loadList: agents.flatMap((a) => a.loadList),
        storageList: [],
      };
    }
    return agents.find((a) => String(a.id) === selectedAgentId) ?? agents[0];
  }, [agents, selectedAgentId, isAllAgents]);

  const genMeters = useMemo(() => {
    if (isAllAgents) {
      return agents.flatMap((agent) =>
        agent.genList.map((a) =>
          buildMeterDetail(a, 'generation', viewDate, isViewingToday, lastUpdated, refreshSeq, {
            agentId: agent.id,
            agentName: agent.name,
          })
        )
      );
    }
    if (!viewScope) return [];
    return viewScope.genList.map((a) =>
      buildMeterDetail(a, 'generation', viewDate, isViewingToday, lastUpdated, refreshSeq)
    );
  }, [agents, viewScope, isAllAgents, viewDate, isViewingToday, lastUpdated, refreshSeq]);

  const loadMeters = useMemo(() => {
    if (isAllAgents) {
      return agents.flatMap((agent) =>
        agent.loadList.map((a) =>
          buildMeterDetail(a, 'load', viewDate, isViewingToday, lastUpdated, refreshSeq, {
            agentId: agent.id,
            agentName: agent.name,
          })
        )
      );
    }
    if (!viewScope) return [];
    return viewScope.loadList.map((a) =>
      buildMeterDetail(a, 'load', viewDate, isViewingToday, lastUpdated, refreshSeq)
    );
  }, [agents, viewScope, isAllAgents, viewDate, isViewingToday, lastUpdated, refreshSeq]);

  const filterMeters = (list: MeterDetail[]) => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (m) =>
        m.meterNo.toLowerCase().includes(q) ||
        m.siteName.toLowerCase().includes(q) ||
        m.no.toLowerCase().includes(q) ||
        (m.agentName?.toLowerCase().includes(q) ?? false)
    );
  };

  const genFiltered = filterMeters(genMeters);
  const loadFiltered = filterMeters(loadMeters);

  const ingestion = useMemo(
    () => buildIngestionStatus(genMeters, loadMeters, lastUpdated),
    [genMeters, loadMeters, lastUpdated]
  );

  const refDate = useMemo(() => parseLocalDate(viewDate), [viewDate]);
  const holiday = isWeekend(refDate);

  const genAssetAgentMap = useMemo(() => {
    const map = new Map<string, number>();
    if (isAllAgents) {
      for (const agent of agents) {
        for (const asset of agent.genList) {
          map.set(asset.id, agent.id);
        }
      }
    }
    return map;
  }, [agents, isAllAgents]);

  const loadAssetAgentMap = useMemo(() => {
    const map = new Map<string, number>();
    if (isAllAgents) {
      for (const agent of agents) {
        for (const asset of agent.loadList) {
          map.set(asset.id, agent.id);
        }
      }
    }
    return map;
  }, [agents, isAllAgents]);

  const genDaily = useMemo(
    () =>
      viewScope
        ? buildDailySeries('generation', viewScope.genList, viewDate, isViewingToday, lastUpdated, refreshSeq, {
            agentIdForAsset: (asset) => genAssetAgentMap.get(asset.id),
          })
        : [],
    [viewScope, viewDate, isViewingToday, lastUpdated, refreshSeq, genAssetAgentMap]
  );

  const loadDaily = useMemo(
    () =>
      viewScope
        ? buildDailySeries('load', viewScope.loadList, viewDate, isViewingToday, lastUpdated, refreshSeq, {
            agentIdForAsset: (asset) => loadAssetAgentMap.get(asset.id),
          })
        : [],
    [viewScope, viewDate, isViewingToday, lastUpdated, refreshSeq, loadAssetAgentMap]
  );

  const chartDateLabel = viewDate.replace(/-/g, '/');
  const genChartOption = useMemo(
    () =>
      buildDailyChartOption(
        `${L.chartGen} - ${chartDateLabel} ${L.chartTrend}`,
        genDaily,
        holiday,
        '#10b981',
        'rgba(16,185,129,0.35)'
      ),
    [genDaily, holiday, chartDateLabel]
  );

  const loadChartOption = useMemo(
    () =>
      buildDailyChartOption(
        `${L.chartLoad} - ${chartDateLabel} ${L.chartTrend}`,
        loadDaily,
        holiday,
        '#0ea5e9',
        'rgba(14,165,233,0.35)'
      ),
    [loadDaily, holiday, chartDateLabel]
  );

  const systemGenSum = genMeters.reduce((s, m) => s + m.systemKwh, 0);
  const systemLoadSum = loadMeters.reduce((s, m) => s + m.systemKwh, 0);

  const onRefresh = () => {
    setLastUpdated(new Date());
    setRefreshSeq((n) => n + 1);
  };

  const goToday = () => {
    setViewDate(todayStr);
    onRefresh();
  };

  const handleDownloadHistory = (kind: MeterKind) => {
    if (!viewScope || agents.length === 0) return;
    const prefix = kind === 'generation' ? L.csvGen : L.csvLoad;

    const rows = isAllAgents
      ? agents.flatMap((agent) => {
          const assets = kind === 'generation' ? agent.genList : agent.loadList;
          return buildHistoryCsvRows(
            agent.name,
            assets,
            kind,
            viewDate,
            isViewingToday,
            lastUpdated,
            refreshSeq,
            L.csvAuth,
            L.csvPending,
            { agentId: agent.id }
          );
        })
      : buildHistoryCsvRows(
          viewScope.name,
          kind === 'generation' ? viewScope.genList : viewScope.loadList,
          kind,
          viewDate,
          isViewingToday,
          lastUpdated,
          refreshSeq,
          L.csvAuth,
          L.csvPending
        );

    const fileAgent = isAllAgents ? L.allAgents : viewScope.name;
    downloadCsv(`${fileAgent}_${prefix}_AMI_15m_${viewDate}.csv`, [...L.csvHeaders], rows);
  };

  if (!viewScope || agents.length === 0) {
    return <p className="text-slate-600">{L.noAgent}</p>;
  }

  const apiAgentSegment = isAllAgents ? 'all' : String(viewScope.id);

  const dayType = holiday ? L.trendHoliday : L.trendWeekday;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-slate-500">{L.pageTag}</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">{L.pageTitle}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
              {L.pageDescBefore}
              <strong className="text-slate-800">{L.pageDescToday}</strong>
              {L.pageDescAfter}{' '}
              <span className="font-bold text-amber-700">
                {AMI_LAG_HOURS} {L.pageDescHours}
              </span>
              ?
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex flex-wrap items-end gap-2">
              <Select value={selectedAgentId} onValueChange={setSelectedAgentId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={L.selectAgent} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_AGENTS_ID}>{L.allAgents}</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <Label htmlFor="ami-view-date" className="text-xs text-slate-500">
                  {L.queryDate}
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="ami-view-date"
                    type="date"
                    className="w-40"
                    max={todayStr}
                    value={viewDate}
                    onChange={(e) => setViewDate(e.target.value)}
                  />
                  {!isViewingToday && (
                    <Button type="button" variant="outline" size="sm" onClick={goToday}>
                      {L.backToday}
                    </Button>
                  )}
                </div>
              </div>
              <Button type="button" variant="secondary" onClick={onRefresh} disabled={!isViewingToday}>
                {L.refresh}
              </Button>
            </div>
            {isViewingToday ? (
              <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold text-violet-800">
                {L.liveMode} {formatClock(lastUpdated)}
              </span>
            ) : (
              <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-bold text-slate-700">
                {L.historyMode} {viewDate.replace(/-/g, '/')}
              </span>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
            <p className="text-sm text-emerald-800">{L.genMeterCount}</p>
            <p className="mt-2 text-3xl font-bold text-emerald-900">{genMeters.length}</p>
            <p className="mt-1 text-xs text-emerald-700">
              {L.latestSum} {Math.round(systemGenSum * 10) / 10} kWh
            </p>
          </div>
          <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
            <p className="text-sm text-sky-800">{L.loadMeterCount}</p>
            <p className="mt-2 text-3xl font-bold text-sky-900">{loadMeters.length}</p>
            <p className="mt-1 text-xs text-sky-700">
              {L.latestSum} {Math.round(systemLoadSum * 10) / 10} kWh
            </p>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-sm text-amber-800">{L.lagTitle}</p>
            <p className="mt-2 text-3xl font-bold text-amber-900">
              {isViewingToday ? `${L.lagAbout} ${ingestion.lagHours} ${L.lagUnit}` : '-'}
            </p>
            <p className="mt-1 text-xs text-amber-700">
              {isViewingToday ? `${L.systemLatest} ${formatDateTime(ingestion.lastBatchAt)}` : L.lagHistory}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm text-slate-600">{L.ingestTitle}</p>
            <p className="mt-2 text-lg font-bold text-slate-900">
              {isViewingToday
                ? ingestion.pipeline === 'normal'
                  ? L.ingestNormal
                  : L.ingestDelayed
                : L.ingestHistory}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {L.ingestDetail} {ingestion.genReceived}/{ingestion.genTotal} | {L.ingestLoadDetail}{' '}
              {ingestion.loadReceived}/{ingestion.loadTotal}
            </p>
          </div>
        </div>
      </section>

      <Alert className="border-violet-200 bg-violet-50/50">
        <i className="fas fa-plug text-violet-600" />
        <AlertTitle className="text-violet-900">{L.apiTitle}</AlertTitle>
        <AlertDescription className="space-y-3 text-slate-700">
          <p>
            <span className="font-semibold">{L.apiRealtime}</span>
            <code className="ml-1 rounded bg-white px-2 py-0.5 text-xs">
              GET /api/v1/agents/{apiAgentSegment}/ami/realtime
            </code>
          </p>
          <p>
            <span className="font-semibold">{L.apiHistory}</span>
            <code className="ml-1 rounded bg-white px-2 py-0.5 text-xs">
              GET /api/v1/agents/{apiAgentSegment}/ami/history?date={viewDate}
            </code>
          </p>
          <p className="text-xs text-slate-500">{L.csvIntervalNote}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button type="button" size="sm" variant="outline" onClick={() => handleDownloadHistory('generation')}>
              <i className="fas fa-download mr-2" />
              {L.dlGen} {viewDate} {L.dlGenSuffix}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => handleDownloadHistory('load')}>
              <i className="fas fa-download mr-2" />
              {L.dlGen} {viewDate} {L.dlLoadSuffix}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-center gap-3">
        <Input className="max-w-md" placeholder={L.searchPh} value={search} onChange={(e) => setSearch(e.target.value)} />
        <p className="text-sm text-slate-500">
          {isViewingToday
            ? `${L.trendToday}${dayType}${L.trendShape}`
            : `${L.trendHistory} ${viewDate.replace(/-/g, '/')} ${L.trendHistorySuffix}`}
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-2">
        <MeterTable
          title={isViewingToday ? L.genLatestTitle : L.genHistoryTitle}
          subtitle={isAllAgents ? L.allAgentsGenSubtitle : L.genSubtitle}
          meters={genFiltered}
          kind="generation"
          isViewingToday={isViewingToday}
          showAgentColumn={isAllAgents}
        />
        <MeterTable
          title={isViewingToday ? L.loadLatestTitle : L.loadHistoryTitle}
          subtitle={isAllAgents ? L.allAgentsLoadSubtitle : L.loadSubtitle}
          meters={loadFiltered}
          kind="load"
          isViewingToday={isViewingToday}
          showAgentColumn={isAllAgents}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs text-slate-500">
              {L.chartLive}
              {dayType}
              {L.chartRef}
              {!isViewingToday && L.chartHistoryNote}
            </p>
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800">{L.gen}</span>
          </div>
          <div className="h-72 w-full min-w-0">
            <ReactECharts option={genChartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between px-2">
            <p className="text-xs text-slate-500">
              {L.chartLive}
              {dayType}
              {L.chartRef}
              {!isViewingToday && L.chartHistoryNote}
            </p>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-800">{L.load}</span>
          </div>
          <div className="h-72 w-full min-w-0">
            <ReactECharts option={loadChartOption} style={{ height: '100%', width: '100%' }} />
          </div>
        </div>
      </section>
    </div>
  );
}
