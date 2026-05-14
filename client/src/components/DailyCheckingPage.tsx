import { useMemo, useState } from 'react';
import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';

import { useRegistration } from '@/contexts/RegistrationContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const LIGHT_CHART_TEXT = '#64748b';
const LIGHT_AXIS_LINE = '#cbd5e1';
const LIGHT_GRID_LINE = '#e2e8f0';
const LIGHT_CHART_COLORS = {
  predicted: '#60a5fa',
  ami: '#94a3b8',
  anomaly: '#f87171',
  invalid: '#fca5a5',
  neutralBar: '#e2e8f0',
} as const;
const PANEL_CARD_CLASS = 'border border-black bg-white text-slate-800 shadow-none';
const PANEL_BOX_CLASS = 'rounded-xl border border-black bg-white p-4 text-slate-800';
const FIELD_CLASS = 'border-slate-300 bg-white text-slate-800';
const CHART_TOOLTIP = {
  trigger: 'axis' as const,
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  textStyle: { color: '#4A4A4A' },
};
const chartFrameStyle = (height: number) => ({
  height,
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  border: '1px solid #000000',
});

type HourCheckRow = {
  hour: number;
  predictedKwh: number;
  amiKwh: number;
  positiveDeviationRate: number; // (pred - ami) / ami, if pred > ami
  isOverstated: boolean;
  invalidTransferKwh: number;
  invalidReasons: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashUnit(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function fmtPct(rate: number) {
  if (!Number.isFinite(rate)) return '-';
  return `${Math.round(rate * 1000) / 10}%`;
}

function fmtKwh(kwh: number) {
  if (!Number.isFinite(kwh)) return '-';
  return `${Math.round(kwh * 10) / 10}`;
}

function buildDailyRows(seedKey: string, toleranceRate: number): HourCheckRow[] {
  const base = 0.2 + hashUnit(seedKey) * 0.7;
  const anomalyBias = hashUnit(`${seedKey}:bias`);

  return Array.from({ length: 24 }, (_, hour) => {
    const sunShape = hour >= 6 && hour <= 17 ? Math.sin(((hour - 6) / 11) * Math.PI) : 0;
    const amiBase =
      (sunShape * (880 + base * 420) + (hour < 6 || hour > 17 ? 12 + base * 18 : 0)) *
      (0.92 + hashUnit(`${seedKey}:${hour}:a`) * 0.12);

    const noise = 0.9 + hashUnit(`${seedKey}:${hour}:p`) * 0.25;
    const maybeOver = hour >= 8 && hour <= 15 && hashUnit(`${seedKey}:${hour}:over`) < (0.12 + anomalyBias * 0.18);
    const overFactor = maybeOver ? 1 + (toleranceRate + 0.12 + hashUnit(`${seedKey}:${hour}:of`) * 0.55) : 1;

    const amiKwh = Math.round(amiBase * 10) / 10;
    const predictedKwh = Math.round(Math.max(0, amiBase * noise * overFactor) * 10) / 10;

    const positiveDeviationRate =
      predictedKwh > amiKwh ? (predictedKwh - amiKwh) / Math.max(amiKwh, 0.01) : 0;
    const isOverstated = predictedKwh > amiKwh && positiveDeviationRate > toleranceRate;

    const invalidTransferKwh = isOverstated
      ? Math.round(((predictedKwh - amiKwh) * (0.45 + hashUnit(`${seedKey}:${hour}:t`) * 0.35)) * 10) / 10
      : 0;

    const invalidReasons: string[] = [];
    if (isOverstated) invalidReasons.push('預測值正向偏差超過容許值');
    if (amiKwh < 1 && predictedKwh > 10) invalidReasons.push('AMI 量測偏低（疑似通訊/量測異常）');

    return {
      hour,
      predictedKwh,
      amiKwh,
      positiveDeviationRate,
      isOverstated,
      invalidTransferKwh,
      invalidReasons,
    };
  });
}

export default function DailyCheckingPage() {
  const { agents } = useRegistration();

  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const [tolerancePct, setTolerancePct] = useState<number>(30);
  const [appealHours, setAppealHours] = useState<number>(24);
  const [maxAnomalyHours, setMaxAnomalyHours] = useState<number>(6);
  const [avgDeviationThresholdPct, setAvgDeviationThresholdPct] = useState<number>(45);

  const toleranceRate = useMemo(() => clamp(tolerancePct, 0, 200) / 100, [tolerancePct]);

  const seedKey = useMemo(() => `${date}:${agentFilter === 'all' ? 'ALL' : agentFilter}`, [date, agentFilter]);
  const rows = useMemo(() => buildDailyRows(seedKey, toleranceRate), [seedKey, toleranceRate]);
  const anomalies = useMemo(() => rows.filter((r) => r.isOverstated), [rows]);

  const anomalyHours = anomalies.length;
  const invalidTransferTotal = useMemo(() => anomalies.reduce((s, r) => s + r.invalidTransferKwh, 0), [anomalies]);
  const avgPositiveDev = useMemo(() => {
    const positives = rows.filter((r) => r.predictedKwh > r.amiKwh);
    if (positives.length === 0) return 0;
    return positives.reduce((s, r) => s + r.positiveDeviationRate, 0) / positives.length;
  }, [rows]);

  const shouldInvalidateDay = useMemo(() => {
    const avgThresh = clamp(avgDeviationThresholdPct, 0, 200) / 100;
    return anomalyHours > maxAnomalyHours || avgPositiveDev > avgThresh;
  }, [anomalyHours, maxAnomalyHours, avgDeviationThresholdPct, avgPositiveDev]);

  const dayInvalidReasons = useMemo(() => {
    const reasons: string[] = [];
    if (anomalyHours > maxAnomalyHours) reasons.push(`異常高估時段數超過上限（${anomalyHours}/${maxAnomalyHours}）`);
    const avgThresh = clamp(avgDeviationThresholdPct, 0, 200) / 100;
    if (avgPositiveDev > avgThresh) reasons.push(`全日平均正向偏差率過高（${fmtPct(avgPositiveDev)} > ${avgDeviationThresholdPct}%）`);
    return reasons;
  }, [anomalyHours, maxAnomalyHours, avgDeviationThresholdPct, avgPositiveDev]);

  const deviationChartOption: EChartsOption = useMemo(() => {
    const x = rows.map((r) => `${String(r.hour).padStart(2, '0')}:00`);
    const predicted = rows.map((r) => r.predictedKwh);
    const ami = rows.map((r) => r.amiKwh);
    const overScatter = rows.map((r) => (r.isOverstated ? r.predictedKwh : null));

    return {
      backgroundColor: '#ffffff',
      animation: false,
      grid: { top: 44, right: 18, bottom: 54, left: 56, containLabel: true },
      tooltip: {
        ...CHART_TOOLTIP,
        valueFormatter: (v: unknown) => (typeof v === 'number' ? `${v} kWh` : String(v)),
      },
      legend: { top: 10, right: 10, textStyle: { fontSize: 11, color: LIGHT_CHART_TEXT, fontWeight: 600 } },
      xAxis: {
        type: 'category',
        data: x,
        axisLabel: { fontSize: 10, interval: 3, color: LIGHT_CHART_TEXT, fontWeight: 500 },
        axisLine: { lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: LIGHT_CHART_TEXT, fontWeight: 600 },
        axisLabel: { fontSize: 10, color: LIGHT_CHART_TEXT, fontWeight: 500 },
        axisLine: { show: true, lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
        splitLine: { lineStyle: { color: LIGHT_GRID_LINE, width: 1, opacity: 0.9 } },
      },
      series: [
        {
          name: '預測發電量（D-1）',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.6, color: LIGHT_CHART_COLORS.predicted },
          itemStyle: { color: LIGHT_CHART_COLORS.predicted },
          data: predicted,
        },
        {
          name: 'AMI 量測（D）',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2, color: LIGHT_CHART_COLORS.ami, type: 'dashed' },
          itemStyle: { color: LIGHT_CHART_COLORS.ami },
          data: ami,
        },
        {
          name: '異常標註',
          type: 'scatter',
          symbolSize: 10,
          itemStyle: { color: LIGHT_CHART_COLORS.anomaly },
          data: overScatter,
        },
      ],
    };
  }, [rows]);

  const invalidTransferOption: EChartsOption = useMemo(() => {
    const x = rows.map((r) => `${String(r.hour).padStart(2, '0')}:00`);
    const barData = rows.map((r) => ({
      value: r.invalidTransferKwh,
      itemStyle: {
        color: r.invalidTransferKwh > 0 ? LIGHT_CHART_COLORS.invalid : LIGHT_CHART_COLORS.neutralBar,
        opacity: 0.95,
      },
    }));
    return {
      backgroundColor: '#ffffff',
      animation: false,
      grid: { top: 18, right: 18, bottom: 54, left: 56, containLabel: true },
      tooltip: CHART_TOOLTIP,
      xAxis: {
        type: 'category',
        data: x,
        axisLabel: { fontSize: 10, interval: 3, color: LIGHT_CHART_TEXT, fontWeight: 500 },
        axisLine: { lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: LIGHT_CHART_TEXT, fontWeight: 600 },
        axisLabel: { fontSize: 10, color: LIGHT_CHART_TEXT, fontWeight: 500 },
        axisLine: { show: true, lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
        splitLine: { lineStyle: { color: LIGHT_GRID_LINE, width: 1, opacity: 0.9 } },
      },
      series: [
        {
          type: 'bar',
          name: '失效移轉電量（試算）',
          data: barData,
          barMaxWidth: 18,
        },
      ],
    };
  }, [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800">4.1 日檢核（次日偏差結算檢核）</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            D+1 自動比對「預測發電量」與「AMI 量測」，標註異常高估並試算移轉電能失效；提供申復期與原因追溯。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[180px]">
            <div className="mb-1 text-xs font-bold text-slate-700">檢核日期（D）</div>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD_CLASS} />
          </div>
          <div className="w-[260px]">
            <div className="mb-1 text-xs font-bold text-slate-700">代理人</div>
            <Select value={agentFilter} onValueChange={(v) => setAgentFilter(v)}>
              <SelectTrigger className={FIELD_CLASS}>
                <SelectValue placeholder="選擇代理人" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部代理人（彙總）</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={String(a.id)}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            className="border-black bg-white text-slate-800 hover:bg-slate-50"
            onClick={() => {
              const d = new Date();
              d.setDate(d.getDate() - 1);
              setDate(d.toISOString().slice(0, 10));
            }}
          >
            回到昨日
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <Card className={PANEL_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-base">正向偏差容許值</CardTitle>
            <CardDescription>可調整（例如 30% 或 50%）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={200}
                value={tolerancePct}
                onChange={(e) => setTolerancePct(Number(e.target.value))}
                className={FIELD_CLASS}
              />
              <span className="text-sm font-bold text-slate-700">%</span>
            </div>
          </CardContent>
        </Card>

        <Card className={PANEL_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-base">異常時段數上限（N）</CardTitle>
            <CardDescription>超過即啟動失效/追回條件（試算）</CardDescription>
          </CardHeader>
          <CardContent>
            <Input
              type="number"
              min={0}
              max={24}
              value={maxAnomalyHours}
              onChange={(e) => setMaxAnomalyHours(Number(e.target.value))}
              className={FIELD_CLASS}
            />
          </CardContent>
        </Card>

        <Card className={PANEL_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-base">全日平均正向偏差門檻</CardTitle>
            <CardDescription>超過即啟動失效/追回條件（試算）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={200}
                value={avgDeviationThresholdPct}
                onChange={(e) => setAvgDeviationThresholdPct(Number(e.target.value))}
                className={FIELD_CLASS}
              />
              <span className="text-sm font-bold text-slate-700">%</span>
            </div>
          </CardContent>
        </Card>

        <Card className={PANEL_CARD_CLASS}>
          <CardHeader>
            <CardTitle className="text-base">申復期</CardTitle>
            <CardDescription>例如 24 小時</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={168}
                value={appealHours}
                onChange={(e) => setAppealHours(Number(e.target.value))}
                className={FIELD_CLASS}
              />
              <span className="text-sm font-bold text-slate-700">小時</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader className="border-b border-black">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>① 預測 vs AMI 偏差圖（含異常標註）</CardTitle>
              <CardDescription>
                異常判定：當某時段「預測值」不合理地超過「AMI 量測」，且正向偏差率 &gt; {tolerancePct}%。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={anomalyHours > 0 ? 'destructive' : 'secondary'}>
                異常時段 {anomalyHours} / 24
              </Badge>
              <Badge variant="outline" className="border-black text-black">
                平均正向偏差 {fmtPct(avgPositiveDev)}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ReactECharts option={deviationChartOption} style={chartFrameStyle(320)} />
          <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
            <div className="rounded-xl border border-black bg-white p-4 text-slate-800">
              <div className="text-xs font-semibold text-slate-600">通知狀態（示意）</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">前日預測表現報告</div>
              <div className="mt-2 text-xs font-semibold text-slate-600">
                系統將依異常時段清單發送「預測偏離結算通知」，並提供 {appealHours} 小時申復期。
              </div>
            </div>
            <div className="rounded-xl border border-black bg-white p-4 text-slate-800">
              <div className="text-xs font-semibold text-slate-600">虛報高估判定（示意）</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">正向偏差容許值：{tolerancePct}%</div>
              <div className="mt-2 text-xs font-semibold text-slate-600">
                若某時段偏差超過容許值，即標註為異常並納入失效條件試算。
              </div>
            </div>
            <div className="rounded-xl border border-black bg-white p-4 text-slate-800">
              <div className="text-xs font-semibold text-slate-600">風險摘要</div>
              <div className="mt-1 flex items-center gap-2">
                <Badge
                  variant={shouldInvalidateDay ? 'destructive' : 'secondary'}
                  className={
                    shouldInvalidateDay
                      ? undefined
                      : 'border-transparent bg-green-600 text-white hover:bg-green-600/90'
                  }
                >
                  {shouldInvalidateDay ? '疑似啟動移轉失效（試算）' : '未達失效條件（試算）'}
                </Badge>
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-600">
                {shouldInvalidateDay ? dayInvalidReasons.join('；') : '未達「異常時段數」或「平均偏差」門檻。'}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader className="border-b border-black">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>② 移轉電能失效明細（試算）</CardTitle>
              <CardDescription>
                先做「預先試算」：月檢核才會真正做帳務追回處理；此頁用於快速定位「哪個時段有多少移轉電量失效」與原因。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={invalidTransferTotal > 0 ? 'destructive' : 'secondary'}>
                失效移轉合計 {fmtKwh(invalidTransferTotal)} kWh
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ReactECharts option={invalidTransferOption} style={chartFrameStyle(240)} />

          <div className="mt-4 rounded-xl border border-black bg-white">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-slate-50">
                  <TableHead>時段</TableHead>
                  <TableHead>預測（kWh）</TableHead>
                  <TableHead>AMI（kWh）</TableHead>
                  <TableHead>正向偏差</TableHead>
                  <TableHead>異常</TableHead>
                  <TableHead>失效移轉（kWh）</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow
                    key={r.hour}
                    className={
                      r.isOverstated ? 'bg-red-50/60 hover:bg-red-100/50' : 'hover:bg-slate-50'
                    }
                  >
                    <TableCell className="font-semibold text-slate-800">{String(r.hour).padStart(2, '0')}:00</TableCell>
                    <TableCell>{fmtKwh(r.predictedKwh)}</TableCell>
                    <TableCell>{fmtKwh(r.amiKwh)}</TableCell>
                    <TableCell className={r.isOverstated ? 'font-semibold text-rose-600' : 'text-slate-700'}>
                      {r.predictedKwh > r.amiKwh ? fmtPct(r.positiveDeviationRate) : '-'}
                    </TableCell>
                    <TableCell>
                      {r.isOverstated ? (
                        <Badge variant="destructive">虛報高估</Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="border-transparent bg-green-600 text-white hover:bg-green-600/90"
                        >
                          正常
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className={r.invalidTransferKwh > 0 ? 'font-semibold text-rose-600' : 'text-slate-700'}>
                      {r.invalidTransferKwh > 0 ? fmtKwh(r.invalidTransferKwh) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[420px] whitespace-normal text-xs font-semibold text-slate-700">
                      {r.invalidReasons.length > 0 ? r.invalidReasons.join('；') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 text-xs font-semibold text-slate-600">
            註：此頁目前使用示範資料產生圖表與明細，目的是先把「檢核視覺化與操作流程」定稿；之後可再串接後端檢核結果與通知/申復狀態。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

