import type { EChartsOption } from 'echarts';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useUiFont } from '@/contexts/UiFontContext';
import { useRegistration } from '@/contexts/RegistrationContext';
import DataSourceBar from '@/components/DataSourceBar';
import { cn } from '@/lib/utils';

const LIGHT_CHART_TEXT = '#64748b';
const LIGHT_AXIS_LINE = '#cbd5e1';
const LIGHT_GRID_LINE = '#e2e8f0';
const LIGHT_CHART_COLORS = {
  generation: '#fbbf24',
  load: '#38bdf8',
  surplus: '#4ade80',
  residual: '#fdba74',
  storageCharge: '#c4b5fd',
  storageDischarge: '#99f6e4',
  anomaly: '#f87171',
  invalid: '#fca5a5',
  neutralBar: '#e2e8f0',
} as const;
const PANEL_CARD_CLASS = 'border border-black bg-white text-slate-800 shadow-none';
const PANEL_BOX_CLASS = 'rounded-xl border border-black bg-white p-4 text-slate-800';
const FIELD_CLASS = 'border-slate-300 bg-white text-slate-800';
/** 有失效量時：半透明紅底；無則白底不警示 */
const INVALID_BADGE_ALERT = 'border-rose-400/80 bg-rose-500/15 text-rose-900 font-medium shadow-none';
const INVALID_BADGE_OK = 'border-slate-200 bg-white text-slate-800 font-medium shadow-none';
const chartFrameStyle = (height: number) => ({
  height,
  backgroundColor: '#ffffff',
  borderRadius: '8px',
  border: '1px solid #000000',
});

type QuarterRow = {
  slot: string; // HH:MM (15-min)
  settlementGenKwh: number; // 轉直供系統提供：結算用發電量
  settlementLoadKwh: number; // 轉直供系統提供：結算用用電量
  platformTransferToStorageKwh: number; // 本平台核算：移轉電能（存入儲能）
  platformDischargeFromStorageKwh: number; // 本平台核算：儲能放電（供用電）
  surplusKwh: number; // max(gen - load, 0)
  residualLoadKwh: number; // max(load - gen, 0)
  recognizedGreenChargeKwh: number; // 可認列（綠電）
  invalidGreyChargeKwh: number; // 不可認列（灰電）→ 失效量
  reasons: string[];
  isInvalid: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hashUnit(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function fmtKwh(n: number) {
  if (!Number.isFinite(n)) return '-';
  return `${Math.round(n * 10) / 10}`;
}

function buildQuarterSlotsForMonth(anchor: string): string[] {
  // Demo: 1 day (96 slots) to keep UI readable; later can expand to full month paging.
  const day = anchor.slice(0, 10);
  return Array.from({ length: 96 }, (_, i) => {
    const h = Math.floor(i / 4);
    const m = (i % 4) * 15;
    return `${day} ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

function buildMonthlyQuarterRows(seedKey: string, greyRuleMode: 'strict' | 'tolerant', tolerancePct: number): QuarterRow[] {
  const tol = clamp(tolerancePct, 0, 200) / 100;
  const slots = buildQuarterSlotsForMonth(seedKey);

  return slots.map((slot, idx) => {
    const u = hashUnit(`${seedKey}:${slot}`);
    const hour = Math.floor(idx / 4);

    // Settlement generation/load are external truth from 轉直供系統 (demo numbers)
    const sunShape = hour >= 6 && hour <= 17 ? Math.sin(((hour - 6) / 11) * Math.PI) : 0;
    const settlementGenKwh = Math.max(0, (sunShape * (210 + u * 120) + (hour < 6 || hour > 17 ? 3 + u * 5 : 0)) * (0.86 + u * 0.22));
    const settlementLoadKwh = Math.max(6, (55 + Math.cos(((hour - 13) / 11) * Math.PI) * 18) * (0.92 + hashUnit(`${seedKey}:${slot}:l`) * 0.16));

    const surplusKwh = Math.max(0, settlementGenKwh - settlementLoadKwh);
    const residualLoadKwh = Math.max(0, settlementLoadKwh - settlementGenKwh);

    // Platform transfer-to-storage (charge) computed by this platform (demo)
    const baseTransfer = Math.max(0, settlementGenKwh * (0.25 + hashUnit(`${seedKey}:${slot}:t`) * 0.42));

    // Inject some invalid cases: transfer > settlementGen => grey portion exists (cannot be recognized)
    const injectInvalid = hour >= 9 && hour <= 15 && hashUnit(`${seedKey}:${slot}:inv`) < 0.15;
    const platformTransferToStorageKwh = injectInvalid
      ? baseTransfer * (1.15 + hashUnit(`${seedKey}:${slot}:inv2`) * 0.75)
      : baseTransfer * (0.92 + hashUnit(`${seedKey}:${slot}:ok`) * 0.18);

    // Storage discharge (negative bar in chart). Demo: discharge from residual load with occasional "over-discharge".
    const baseDischarge = residualLoadKwh * (0.28 + hashUnit(`${seedKey}:${slot}:d`) * 0.42);
    const injectOverDischarge = hour >= 18 && hour <= 22 && hashUnit(`${seedKey}:${slot}:od`) < 0.09;
    const platformDischargeFromStorageKwh = injectOverDischarge
      ? baseDischarge * (1.25 + hashUnit(`${seedKey}:${slot}:od2`) * 0.55)
      : baseDischarge * (0.9 + hashUnit(`${seedKey}:${slot}:dok`) * 0.18);

    // Rule: recognized green charge cannot exceed settlement generation (physical constraint)
    const rawGrey = Math.max(0, platformTransferToStorageKwh - settlementGenKwh);

    // Optionally tolerate small exceed as rounding/clock drift
    const allowedGrey = greyRuleMode === 'tolerant' ? settlementGenKwh * tol : 0;
    const invalidGreyChargeKwh = Math.max(0, rawGrey - allowedGrey);
    const recognizedGreenChargeKwh = Math.max(0, platformTransferToStorageKwh - invalidGreyChargeKwh);

    const reasons: string[] = [];
    let isInvalid = false;
    if (invalidGreyChargeKwh > 0) {
      isInvalid = true;
      reasons.push('移轉存入儲能量 > 結算用發電量，灰電混入不可認列');
      if (greyRuleMode === 'tolerant' && allowedGrey > 0) reasons.push(`已扣除容許值（${tolerancePct}%）後仍超量`);
    }

    // Additional compliance hint: if load is too low, transfer may be suspicious (demo placeholder)
    if (platformTransferToStorageKwh > settlementLoadKwh * 2.2) {
      reasons.push('移轉/用電關係異常（待補物理限制校核）');
    }

    return {
      slot,
      settlementGenKwh: Math.round(settlementGenKwh * 10) / 10,
      settlementLoadKwh: Math.round(settlementLoadKwh * 10) / 10,
      platformTransferToStorageKwh: Math.round(platformTransferToStorageKwh * 10) / 10,
      platformDischargeFromStorageKwh: Math.round(platformDischargeFromStorageKwh * 10) / 10,
      surplusKwh: Math.round(surplusKwh * 10) / 10,
      residualLoadKwh: Math.round(residualLoadKwh * 10) / 10,
      recognizedGreenChargeKwh: Math.round(recognizedGreenChargeKwh * 10) / 10,
      invalidGreyChargeKwh: Math.round(invalidGreyChargeKwh * 10) / 10,
      reasons,
      isInvalid,
    };
  });
}

export default function MonthlyCheckingPage() {
  const { chartFonts } = useUiFont();
  const { agents } = useRegistration();

  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [agentFilter, setAgentFilter] = useState<string>('all');

  const [greyRuleMode, setGreyRuleMode] = useState<'strict' | 'tolerant'>('strict');
  const [tolerancePct, setTolerancePct] = useState<number>(3);

  const seedKey = useMemo(() => `${month}:${agentFilter === 'all' ? 'ALL' : agentFilter}`, [month, agentFilter]);
  const rows = useMemo(
    () => buildMonthlyQuarterRows(seedKey, greyRuleMode, tolerancePct),
    [seedKey, greyRuleMode, tolerancePct]
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.gen += r.settlementGenKwh;
        acc.load += r.settlementLoadKwh;
        acc.transfer += r.platformTransferToStorageKwh;
        acc.recognized += r.recognizedGreenChargeKwh;
        acc.invalid += r.invalidGreyChargeKwh;
        acc.invalidSlots += r.isInvalid ? 1 : 0;
        return acc;
      },
      { gen: 0, load: 0, transfer: 0, recognized: 0, invalid: 0, invalidSlots: 0 }
    );
  }, [rows]);

  const relationshipOption: EChartsOption = useMemo(() => {
    const x = rows.map((r) => r.slot.slice(11)); // HH:MM
    const gen = rows.map((r) => r.settlementGenKwh);
    const load = rows.map((r) => r.settlementLoadKwh);

    return {
      backgroundColor: '#ffffff',
      animation: false,
      grid: { top: 44, right: 18, bottom: 54, left: 56, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        textStyle: { color: '#4A4A4A' },
      },
      legend: { top: 10, right: 10, textStyle: { fontSize: chartFonts.legend, color: LIGHT_CHART_TEXT, fontWeight: 600 } },
      xAxis: {
        type: 'category',
        data: x,
        axisLabel: { fontSize: chartFonts.axis, interval: 7, color: LIGHT_CHART_TEXT, fontWeight: 500 },
        axisLine: { lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: LIGHT_CHART_TEXT, fontWeight: 600 },
        axisLabel: { fontSize: chartFonts.axis, fontWeight: 500, color: LIGHT_CHART_TEXT },
        axisLine: { show: true, lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
        splitLine: { lineStyle: { color: LIGHT_GRID_LINE, width: 1, opacity: 0.9 } },
      },
      series: [
        {
          name: '結算用發電量',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.6, color: LIGHT_CHART_COLORS.generation },
          itemStyle: { color: LIGHT_CHART_COLORS.generation },
          data: gen,
        },
        {
          name: '結算用用電量',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.2, color: LIGHT_CHART_COLORS.load },
          itemStyle: { color: LIGHT_CHART_COLORS.load },
          data: load,
        },
      ],
    };
  }, [rows, chartFonts]);

  const surplusStorageOption: EChartsOption = useMemo(() => {
    const x = rows.map((r) => r.slot.slice(11)); // HH:MM
    const surplus = rows.map((r) => r.surplusKwh);
    const residualNeg = rows.map((r) => (r.residualLoadKwh > 0 ? -r.residualLoadKwh : 0));
    const storageNet = rows.map((r) => {
      const charge = r.platformTransferToStorageKwh;
      const discharge = r.platformDischargeFromStorageKwh;
      let value = 0;
      if (typeof charge === 'number' && charge > 0) value = charge;
      else if (typeof discharge === 'number' && discharge > 0) value = -discharge;
      return {
        value,
        itemStyle: {
          color: value >= 0 ? LIGHT_CHART_COLORS.storageCharge : LIGHT_CHART_COLORS.storageDischarge,
          opacity: 0.95,
        },
      };
    });

    // Mark potential over-charge/over-discharge on the storage series (demo)
    const overMark = rows
      .map((r) => {
        const charge = r.platformTransferToStorageKwh;
        const discharge = r.platformDischargeFromStorageKwh;
        const overCharge = r.surplusKwh > 0 ? charge - r.surplusKwh : charge;
        const overDischarge = r.residualLoadKwh > 0 ? discharge - r.residualLoadKwh : discharge;
        if (overCharge > 0.01)
          return {
            value: charge,
            xAxis: r.slot.slice(11),
            itemStyle: { color: LIGHT_CHART_COLORS.anomaly }
          };
        if (overDischarge > 0.01)
          return {
            value: -discharge,
            xAxis: r.slot.slice(11),
            itemStyle: { color: LIGHT_CHART_COLORS.anomaly }
          };
        return null;
      })
      .filter(Boolean);

    return {
      backgroundColor: '#ffffff',
      animation: false,
      grid: { top: 44, right: 18, bottom: 54, left: 56, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        textStyle: { color: '#4A4A4A' },
      },
      legend: { top: 10, right: 10, textStyle: { fontSize: chartFonts.legend, color: LIGHT_CHART_TEXT, fontWeight: 600 } },
      xAxis: {
        type: 'category',
        data: x,
        axisLabel: { fontSize: chartFonts.axis, interval: 7, color: LIGHT_CHART_TEXT, fontWeight: 500 },
        axisLine: { lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
      },
      yAxis: {
        type: 'value',
        name: 'kWh',
        nameTextStyle: { color: LIGHT_CHART_TEXT, fontWeight: 600 },
        axisLabel: { fontSize: chartFonts.axis, fontWeight: 500, color: LIGHT_CHART_TEXT },
        axisLine: { show: true, lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } },
        splitLine: { lineStyle: { color: LIGHT_GRID_LINE, width: 1, opacity: 0.9 } },
      },
      series: [
        {
          name: '餘電（發電-用電）',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.2, color: LIGHT_CHART_COLORS.surplus },
          itemStyle: { color: LIGHT_CHART_COLORS.surplus },
          data: surplus,
        },
        {
          name: '殘載（用電-發電）',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2.2, color: LIGHT_CHART_COLORS.residual },
          itemStyle: { color: LIGHT_CHART_COLORS.residual },
          data: residualNeg,
        },
        {
          name: '儲能（平台核算）',
          type: 'bar',
          data: storageNet,
          barMaxWidth: 16,
          markPoint: {
            symbol: 'circle',
            symbolSize: 16,
            itemStyle: {
              color: LIGHT_CHART_COLORS.anomaly,
              shadowColor: LIGHT_CHART_COLORS.anomaly,
              shadowBlur: 10,
            },
            data: overMark as any[],
          },
        },
      ],
    };
  }, [rows, chartFonts]);

  const invalidBarOption: EChartsOption = useMemo(() => {
    const x = rows.map((r) => r.slot.slice(11)); // HH:MM
    const barData = rows.map((r) => ({
      value: r.invalidGreyChargeKwh,
      itemStyle: {
        color: r.invalidGreyChargeKwh > 0 ? LIGHT_CHART_COLORS.invalid : LIGHT_CHART_COLORS.neutralBar,
      },
    }));
    return {
      backgroundColor: '#ffffff',
      animation: false,
      grid: { top: 18, right: 18, bottom: 54, left: 56, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        textStyle: { color: '#4A4A4A' },
      },
      xAxis: { type: 'category', data: x, axisLabel: { fontSize: chartFonts.axis, interval: 7, color: LIGHT_CHART_TEXT, fontWeight: 500 }, axisLine: { lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } } },
      yAxis: { type: 'value', name: 'kWh', nameTextStyle: { color: LIGHT_CHART_TEXT, fontWeight: 600 }, axisLabel: { fontSize: chartFonts.axis, fontWeight: 500, color: LIGHT_CHART_TEXT }, axisLine: { show: true, lineStyle: { color: LIGHT_AXIS_LINE, width: 1 } }, splitLine: { lineStyle: { color: LIGHT_GRID_LINE, width: 1, opacity: 0.9 } } },
      series: [
        {
          type: 'bar',
          name: '失效（灰電）',
          data: barData,
          barMaxWidth: 14,
        },
      ],
    };
  }, [rows, chartFonts]);

  const invalidRows = useMemo(() => rows.filter((r) => r.invalidGreyChargeKwh > 0.0001), [rows]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-800">4.2 月檢核（物理限制校核＋帳務沖銷）</h2>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            在代理人執行最終電量分配結算前，整合「轉直供系統」結算用實體電量與本平台核算移轉量，檢核合規性並標記失效電量（灰電不可認列）。
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-[170px]">
            <div className="mb-1 text-xs font-semibold text-slate-700">月份</div>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={FIELD_CLASS} />
          </div>

          <div className="flex items-center gap-2 rounded-lg border border-black bg-white px-3 py-2">
            <div className="text-xs font-semibold text-slate-700">代理人</div>
            <select
              className="bg-transparent text-sm font-bold text-slate-800 outline-none"
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
            >
              <option value="all">全部代理人（彙總）</option>
              {agents.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            className="border-black bg-white text-slate-800 hover:bg-slate-50"
            onClick={() => setMonth(new Date().toISOString().slice(0, 7))}
          >
            本月
          </Button>
        </div>
      </div>

      <DataSourceBar onApplyFullRange={() => setMonth(new Date().toISOString().slice(0, 7))} />

      <Alert className={`${PANEL_CARD_CLASS} py-4`}>
        <AlertTitle>檢核主軸（你描述的灰電失效規則）</AlertTitle>
        <AlertDescription>
          以每 15 分鐘為單位：若「本平台核算的移轉存入儲能量」 &gt; 「轉直供系統的結算用發電量」，超出的部分視為灰電混入，
          <span className="font-semibold text-slate-800">不可認列</span>，需標記為失效並於帳務沖銷/結算扣除。
        </AlertDescription>
      </Alert>

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader className="border-b border-black">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>① 實體電量 × 移轉量關係視覺化（可切頁籤看明細）</CardTitle>
              <CardDescription>
                電量來源：轉直供系統（結算用發電/用電）＋本平台核算（移轉存入儲能）。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="text-black">
                結算用發電 {fmtKwh(totals.gen)} kWh
              </Badge>
              <Badge variant="outline" className="text-black">
                結算用用電 {fmtKwh(totals.load)} kWh
              </Badge>
              <Badge variant="outline" className="text-black">
                移轉存入儲能 {fmtKwh(totals.transfer)} kWh
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ReactECharts
            option={relationshipOption}
            style={chartFrameStyle(260)}
          />

          <div className={`mt-4 ${PANEL_BOX_CLASS}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-slate-800">移轉存入儲能量（獨立趨勢圖）＋餘電/殘載對照</div>
                <div className="mt-1 text-xs font-semibold text-slate-600">
                  用結算用發電/用電計算餘電(正)與殘載(負)，並以長條呈現儲能充放電（充電為正值、放電為負值）。
                  若出現超充/超放，會以紅點標示（示意）。
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-black">
                  可認列綠電（充電）{fmtKwh(totals.recognized)} kWh
                </Badge>
                <Badge
                  variant="outline"
                  className={totals.invalid > 0 ? INVALID_BADGE_ALERT : INVALID_BADGE_OK}
                >
                  失效灰電 {fmtKwh(totals.invalid)} kWh
                </Badge>
              </div>
            </div>
            <div className="mt-3">
              <ReactECharts
                option={surplusStorageOption}
                style={chartFrameStyle(280)}
              />
            </div>
          </div>

          <Separator className="my-6" />

          <Tabs defaultValue="detail" className="w-full">
            <TabsList className="flex h-auto w-full flex-wrap justify-start gap-3 bg-transparent p-0">
              <TabsTrigger
                value="detail"
                className="flex-none rounded-lg border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 data-[state=active]:border-indigo-600 data-[state=active]:bg-indigo-600 data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                明細表（15 分鐘）
              </TabsTrigger>
              <TabsTrigger
                value="rule"
                className="flex-none rounded-lg border-2 border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 data-[state=active]:border-emerald-700 data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-md"
              >
                檢核規則與狀態
              </TabsTrigger>
            </TabsList>

            <TabsContent value="detail" className="pt-4">
              <div className="rounded-xl border border-black bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-slate-50 [&_th]:text-black">
                      <TableHead>時段</TableHead>
                      <TableHead>結算用發電（kWh）</TableHead>
                      <TableHead>結算用用電（kWh）</TableHead>
                      <TableHead>移轉存入儲能（kWh）</TableHead>
                      <TableHead>可認列綠電（kWh）</TableHead>
                      <TableHead>失效灰電（kWh）</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 48).map((r) => (
                      <TableRow
                        key={r.slot}
                        className={
                          r.isInvalid ? 'bg-red-50/60 hover:bg-red-100/50' : 'hover:bg-slate-50'
                        }
                      >
                        <TableCell className="font-bold text-slate-800">{r.slot.slice(11)}</TableCell>
                        <TableCell>{fmtKwh(r.settlementGenKwh)}</TableCell>
                        <TableCell>{fmtKwh(r.settlementLoadKwh)}</TableCell>
                        <TableCell className="font-bold">{fmtKwh(r.platformTransferToStorageKwh)}</TableCell>
                        <TableCell className="text-emerald-600 font-semibold">{fmtKwh(r.recognizedGreenChargeKwh)}</TableCell>
                        <TableCell className={r.invalidGreyChargeKwh > 0 ? 'text-rose-600 font-semibold' : 'text-slate-700'}>
                          {r.invalidGreyChargeKwh > 0 ? fmtKwh(r.invalidGreyChargeKwh) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs font-semibold text-slate-600">
                註：此處為示範資料，先用「單日 96 筆」呈現 15 分鐘核算的 UX；後續可加上整月分頁/篩選與匯出。
              </div>
            </TabsContent>

            <TabsContent value="rule" className="pt-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <Card className={PANEL_CARD_CLASS}>
                  <CardHeader>
                    <CardTitle className="text-base">灰電失效模式</CardTitle>
                    <CardDescription>嚴格 or 容許（處理四捨五入/對時誤差）</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setGreyRuleMode('strict')}
                        className={cn(
                          'min-w-[96px] border-2 font-semibold',
                          greyRuleMode === 'strict'
                            ? 'border-rose-800 bg-rose-800 text-white hover:bg-rose-800/90 hover:text-white'
                            : 'border-rose-200 bg-white text-rose-900 hover:bg-rose-50'
                        )}
                      >
                        嚴格
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setGreyRuleMode('tolerant')}
                        className={cn(
                          'min-w-[96px] border-2 font-semibold',
                          greyRuleMode === 'tolerant'
                            ? 'border-emerald-700 bg-emerald-600 text-white hover:bg-emerald-600/90 hover:text-white'
                            : 'border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50'
                        )}
                      >
                        容許
                      </Button>
                    </div>
                    <div className="mt-3 text-xs font-semibold text-slate-600">
                      - **嚴格**：只要移轉存入 &gt; 結算用發電，超出即失效。<br />
                      - **容許**：可設定容許比例，先扣除容許值後仍超出才失效。
                    </div>
                  </CardContent>
                </Card>

                <Card className={PANEL_CARD_CLASS}>
                  <CardHeader>
                    <CardTitle className="text-base">容許比例（僅容許模式）</CardTitle>
                    <CardDescription>預設 3%（可依規則調整）</CardDescription>
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
                    <div className="mt-2 text-xs font-semibold text-slate-600">
                      容許值會以「結算用發電量 × 比例」計算；仍超出的部分才列為失效灰電。
                    </div>
                  </CardContent>
                </Card>

                <Card className={PANEL_CARD_CLASS}>
                  <CardHeader>
                    <CardTitle className="text-base">風險摘要</CardTitle>
                    <CardDescription>失效時段與失效量</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={
                          totals.invalidSlots === 0 && totals.invalid === 0
                            ? INVALID_BADGE_OK
                            : INVALID_BADGE_ALERT
                        }
                      >
                        失效時段 {totals.invalidSlots} / {rows.length}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={
                          totals.invalidSlots === 0 && totals.invalid === 0
                            ? INVALID_BADGE_OK
                            : INVALID_BADGE_ALERT
                        }
                      >
                        失效灰電合計 {fmtKwh(totals.invalid)} kWh
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs font-semibold text-slate-600">
                      若失效灰電 &gt; 0，則需執行：帳務沖銷（調節帳戶歸零不合規額度）＋結算扣除（不予計入）。
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card className={PANEL_CARD_CLASS}>
        <CardHeader className="border-b border-black">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>② 移轉電能失效明細（灰電不可認列）</CardTitle>
              <CardDescription>
                逐 15 分鐘核實指出：**移轉存入儲能量大於結算用發電量** 的灰電部分，標記失效並列出原因。
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'cursor-default',
                        totals.invalid > 0 ? INVALID_BADGE_ALERT : INVALID_BADGE_OK
                      )}
                    >
                      失效灰電 {fmtKwh(totals.invalid)} kWh
                    </Badge>
                  </div>
                </TooltipTrigger>
                <TooltipContent sideOffset={6}>
                  失效灰電 = max(0, 移轉存入儲能 - 結算用發電 - 容許值)
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <ReactECharts
            option={invalidBarOption}
            style={chartFrameStyle(240)}
          />

          <Separator className="my-6" />

          <div className="rounded-xl border border-black bg-white">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-slate-50 [&_th]:text-black">
                  <TableHead>時段</TableHead>
                  <TableHead>移轉存入（kWh）</TableHead>
                  <TableHead>結算用發電（kWh）</TableHead>
                  <TableHead>可認列（kWh）</TableHead>
                  <TableHead>失效灰電（kWh）</TableHead>
                  <TableHead>原因</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(invalidRows.length > 0 ? invalidRows : rows.slice(0, 12)).map((r) => (
                  <TableRow
                    key={`inv-${r.slot}`}
                    className={
                      r.invalidGreyChargeKwh > 0 ? 'bg-red-50/60 hover:bg-red-100/50' : 'hover:bg-slate-50'
                    }
                  >
                    <TableCell className="font-bold text-slate-800">{r.slot.slice(11)}</TableCell>
                    <TableCell className="font-semibold text-slate-800">{fmtKwh(r.platformTransferToStorageKwh)}</TableCell>
                    <TableCell>{fmtKwh(r.settlementGenKwh)}</TableCell>
                    <TableCell className="font-semibold text-emerald-600">{fmtKwh(r.recognizedGreenChargeKwh)}</TableCell>
                    <TableCell className={r.invalidGreyChargeKwh > 0 ? 'font-semibold text-rose-600' : 'text-slate-700'}>
                      {r.invalidGreyChargeKwh > 0 ? fmtKwh(r.invalidGreyChargeKwh) : '-'}
                    </TableCell>
                    <TableCell className="max-w-[520px] whitespace-normal text-xs font-semibold text-slate-700">
                      {r.reasons.length > 0 ? r.reasons.join('；') : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 text-xs font-semibold text-slate-600">
            註：此頁目前使用示範資料。後續串接真實資料時，表格可再加上：對應案場/表號、計畫群組、調節帳戶沖銷流水號、結算扣除註記等欄位。
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

