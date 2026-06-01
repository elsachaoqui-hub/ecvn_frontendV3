import { useRegistration } from '@/contexts/RegistrationContext';
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
import type { Agent } from '@/data/agentAggregation';
import {
  ALL_AGENTS_ID,
  buildCheckingSummary,
  buildDeclarationAlerts,
  buildImbalanceDailyRows,
  buildImbalanceSlotRows,
  buildRealtimeGenAlerts,
  buildSettlementAbnormal,
  buildStorageBenefitRows,
  enumerateDateKeys,
  formatQuerySummary,
  agentName,
  toDateInputValue,
  toMonthInputValue,
  type DateQueryMode,
  type DateQueryState,
  type MarketImbalanceRow,
} from '@/lib/marketMonitoringData';
import { useMemo, useState } from 'react';

function defaultPageQuery(): DateQueryState {
  const today = toDateInputValue();
  const weekAgo = toDateInputValue(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  return { mode: 'range', start: weekAgo, end: today, month: toMonthInputValue(), agentId: ALL_AGENTS_ID };
}

function DateQueryToolbar({
  title,
  query,
  onChange,
  agents,
  compact,
}: {
  title: string;
  query: DateQueryState;
  onChange: (next: DateQueryState) => void;
  agents: Agent[];
  compact?: boolean;
}) {
  const setMode = (mode: DateQueryMode) => onChange({ ...query, mode });

  return (
    <div className={`rounded-xl border border-slate-200 bg-slate-50/90 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">{title}</p>
          <p className="mt-1 text-sm font-bold text-indigo-900">{formatQuerySummary(query)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['range', '\u8d77\u8fc7\u5340\u9593'],
              ['single', '\u55ae\u65e5'],
              ['month', '\u6574\u6708'],
            ] as const
          ).map(([mode, label]) => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={query.mode === mode ? 'default' : 'outline'}
              className={query.mode === mode ? 'bg-indigo-700 hover:bg-indigo-800' : ''}
              onClick={() => setMode(mode)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-slate-600">{'\u4ee3\u7406\u4eba'}</Label>
          <Select value={query.agentId} onValueChange={(agentId) => onChange({ ...query, agentId })}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder={'\u9078\u64c7\u4ee3\u7406\u4eba'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENTS_ID}>{'\u5168\u90e8\u4ee3\u7406\u4eba\uff08\u5f59\u7e3d\uff09'}</SelectItem>
              {agents.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {query.mode === 'range' && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">{'\u67e5\u8a62\u8d77\u65e5'}</Label>
              <Input
                type="date"
                className="w-40"
                value={query.start}
                max={query.end || undefined}
                onChange={(e) => onChange({ ...query, start: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">{'\u67e5\u8a62\u8fc7\u65e5'}</Label>
              <Input
                type="date"
                className="w-40"
                value={query.end}
                min={query.start || undefined}
                onChange={(e) => onChange({ ...query, end: e.target.value })}
              />
            </div>
          </>
        )}
        {query.mode === 'single' && (
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">{'\u67e5\u8a62\u65e5\u671f'}</Label>
            <Input
              type="date"
              className="w-40"
              value={query.start}
              onChange={(e) => onChange({ ...query, start: e.target.value, end: e.target.value })}
            />
          </div>
        )}
        {query.mode === 'month' && (
          <div className="space-y-1">
            <Label className="text-xs text-slate-600">{'\u67e5\u8a62\u6708\u4efd'}</Label>
            <Input
              type="month"
              className="w-40"
              value={query.month}
              onChange={(e) => onChange({ ...query, month: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ImbalanceReportTable({
  dailyRows,
  drillDate,
  agentIdFilter,
  onDrillDate,
  onBack,
}: {
  dailyRows: MarketImbalanceRow[];
  drillDate: string | null;
  agentIdFilter: string;
  onDrillDate: (dateKey: string) => void;
  onBack: () => void;
}) {
  const slotRows = useMemo(
    () => (drillDate ? buildImbalanceSlotRows(drillDate, agentIdFilter) : []),
    [drillDate, agentIdFilter],
  );
  const displayRows = drillDate ? slotRows : dailyRows;
  const penalizable = displayRows.reduce((sum, r) => sum + (r.imbalanceMWh ?? 0), 0);

  const thRow = 'bg-slate-100 text-slate-700 text-xs font-bold';
  const td = 'px-3 py-2 text-sm text-slate-800 border-t border-slate-200';

  return (
    <div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {drillDate ? (
          <Button type="button" size="sm" variant="outline" onClick={onBack}>
            {'\u2190 \u8fd4\u56de\u6bcf\u65e5\u5217\u8868'}
          </Button>
        ) : (
          <p className="text-xs font-semibold text-slate-600">
            {'\u9ede\u9078\u65e5\u671f\u5217\u53ef\u4e0b\u9477\u67e5\u770b\u8a72\u65e5\u6bcf 15 \u5206\u9418\u660e\u7d30'}
          </p>
        )}
        <span className="text-xs font-bold text-slate-600">
          {drillDate
            ? `15 \u5206\u9418\u660e\u7d30 \u00b7 ${drillDate.replace(/-/g, '/')}（${slotRows.length} \u5217）`
            : `\u6bcf\u65e5\u5f59\u7e3d \u00b7 ${dailyRows.length} \u5217`}
        </span>
      </div>
      <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs font-semibold text-indigo-950">
        <span className="font-black">{'\u5e02\u5834\u89c0\u9ede\u6458\u8981\uff1a'}</span>
        {
          '\u8ce3\u65b9\u8d85\u984d\u4f9b\u96fb\u3001\u8cb7\u65b9\u5c11\u65bc\u627f\u8afe\u7528\u96fb\uff0c\u65bc\u5e02\u5834\u7d50\u7b97\u4e0a\u5747\u8996\u70ba\u7121\u5e73\u8861\u7fa9\u52d9\uff1b\u672c\u8868\u300c\u53ef\u8a08\u7f70\u4e0d\u5e73\u8861\u96fb\u91cf\u300d\u5408\u8a08 '
        }
        <span className="font-black tabular-nums">{penalizable.toFixed(1)}</span> MWh。
      </div>
      <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white">
        <table className="min-w-[880px] w-full">
          <thead className={`${thRow} sticky top-0 z-10`}>
            <tr>
              <th className="px-3 py-2 text-left">{'\u6642\u9593'}</th>
              <th className="px-3 py-2 text-left">{'\u89d2\u8272'}</th>
              <th className="px-3 py-2 text-left">{'\u4ee3\u7406\u4eba'}</th>
              <th className="px-3 py-2 text-right">{'\u5408\u7d04\u8f49\u4f9b\u91cf\uff08MWh\uff09'}</th>
              <th className="px-3 py-2 text-right">{'\u7d50\u7b97\u91cf\uff08MWh\uff09'}</th>
              <th className="px-3 py-2 text-center">{'\u5e73\u8861\u7fa9\u52d9'}</th>
              <th className="px-3 py-2 text-right">{'\u53ef\u8a08\u7f70\u4e0d\u5e73\u8861\u96fb\u91cf\uff08MWh\uff09'}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                  {'\u6240\u9078\u67e5\u8a62\u689d\u4ef6\u4e0b\u5c1a\u7121\u8cc7\u6599'}
                </td>
              </tr>
            ) : (
              displayRows.map((r, i) => {
                const isDailyRow = r.slotIndex === null;
                const canDrill = !drillDate && isDailyRow;
                return (
                  <tr
                    key={`imb-${drillDate ?? 'd'}-${i}`}
                    className={`font-semibold ${canDrill ? 'cursor-pointer hover:bg-indigo-50/60' : ''}`}
                    onClick={canDrill ? () => onDrillDate(r.dateKey) : undefined}
                  >
                    <td className={td}>
                      {canDrill ? (
                        <span className="font-black text-indigo-800 underline decoration-indigo-300">
                          {r.timeLabel}
                        </span>
                      ) : (
                        r.timeLabel
                      )}
                    </td>
                    <td className={td}>
                      <span
                        className={`rounded-md px-2 py-0.5 text-xs font-black ${
                          r.role === '\u8ce3\u65b9'
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-violet-100 text-violet-900'
                        }`}
                      >
                        {r.role}
                      </span>
                    </td>
                    <td className={td}>{agentName(r.agentId)}</td>
                    <td className={`${td} text-right tabular-nums`}>{r.commitmentMWh.toFixed(1)}</td>
                    <td className={`${td} text-right tabular-nums`}>
                      <span className="block text-[10px] font-bold text-slate-500">{r.settledLabel}</span>
                      {r.settledMWh.toFixed(1)}
                    </td>
                    <td className={`${td} text-center`}>
                      {r.hasObligation ? (
                        <span className="text-xs font-black text-rose-800">{'\u6709'}</span>
                      ) : (
                        <span className="text-xs font-bold text-slate-500">{'\u7121'}</span>
                      )}
                    </td>
                    <td
                      className={`${td} text-right tabular-nums ${
                        r.imbalanceMWh != null ? 'font-black text-rose-800' : 'text-slate-400'
                      }`}
                    >
                      {r.imbalanceMWh != null ? r.imbalanceMWh.toFixed(1) : '\u2014'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {drillDate && (
        <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs font-semibold text-slate-600">
          {slotRows
            .filter((r) => r.hasObligation)
            .slice(0, 6)
            .map((r, i) => (
              <li key={`imb-note-${i}`}>
                <span className="font-black text-slate-700">
                  {r.timeLabel} · {r.role}
                </span>
                ：{r.note}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}

export default function MarketMonitoringDashboardPage() {
  const { agents } = useRegistration();
  const [pageQuery, setPageQuery] = useState<DateQueryState>(defaultPageQuery);
  const [settlementQuery, setSettlementQuery] = useState<DateQueryState>(defaultPageQuery);
  const [imbalanceDrillDate, setImbalanceDrillDate] = useState<string | null>(null);

  const pageDateKeys = useMemo(() => enumerateDateKeys(pageQuery), [pageQuery]);
  const settlementDateKeys = useMemo(() => enumerateDateKeys(settlementQuery), [settlementQuery]);

  const realtimeGenAlerts = useMemo(
    () => buildRealtimeGenAlerts(pageDateKeys, pageQuery.agentId),
    [pageDateKeys, pageQuery.agentId],
  );
  const declarationAlerts = useMemo(
    () => buildDeclarationAlerts(pageDateKeys, pageQuery.agentId),
    [pageDateKeys, pageQuery.agentId],
  );
  const checkingSummary = useMemo(
    () => buildCheckingSummary(pageDateKeys, pageQuery.agentId),
    [pageDateKeys, pageQuery.agentId],
  );

  const settlementAbnormal = useMemo(
    () => buildSettlementAbnormal(settlementDateKeys, settlementQuery.agentId),
    [settlementDateKeys, settlementQuery.agentId],
  );
  const storageBenefitRows = useMemo(
    () => buildStorageBenefitRows(settlementDateKeys, settlementQuery.agentId),
    [settlementDateKeys, settlementQuery.agentId],
  );
  const imbalanceDailyRows = useMemo(
    () => buildImbalanceDailyRows(settlementDateKeys, settlementQuery.agentId),
    [settlementDateKeys, settlementQuery.agentId],
  );

  const handleSettlementQueryChange = (next: DateQueryState) => {
    setSettlementQuery(next);
    setImbalanceDrillDate(null);
  };

  const sectionShell = 'rounded-2xl border border-slate-300 bg-white p-5 shadow-sm';
  const thRow = 'bg-slate-100 text-slate-700 text-xs font-bold';
  const td = 'px-3 py-2 text-sm text-slate-800 border-t border-slate-200';
  const normalPrefix = '\u6b63\u5e38';

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">
          {'6.2 \u5e02\u5834\u76e3\u63a7\u5100\u8868\u677f'}
        </h2>
        <p className="mt-1 text-sm font-semibold text-slate-600">
          {
            '\u5f59\u7e3d\u5373\u6642\u767c\u96fb\u3001\u7533\u5831\u8a08\u5283\u3001\u6aa2\u6838\u4f5c\u696d\u8207\u7d50\u7b97\u76f8\u95dc\u7570\u5e38\uff0f\u5831\u8868\u8cc7\u8a0a\uff0c\u4f9b\u7ba1\u7406\u8005\u7531\u4e0a\u800c\u4e0b\u5feb\u901f\u5de1\u6aa2\u3002\u4e0b\u5217\u70ba\u793a\u7bc4\u5047\u8cc7\u6599\uff0c\u53ef\u6539\u63a5\u76e3\u63a7 API\u3002'
          }
        </p>
        <div className="mt-4">
          <DateQueryToolbar
            title={'\u5168\u9801\u67e5\u8a62\u689d\u4ef6\uff08\u5340\u584a\u4e00\uff5e\u4e09\uff09'}
            query={pageQuery}
            onChange={setPageQuery}
            agents={agents}
          />
        </div>
      </div>

      <section className={sectionShell}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {'\u4e00\u3001\u5373\u6642\u767c\u96fb\u91cf\u76e3\u63a7'}
            </h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              {
                '\u82e5\u4ee3\u7406\u4eba\u65d7\u4e0b\u6848\u5834\u56de\u50b3\u4e4b\u5373\u6642\u767c\u96fb\u91cf\u72c0\u614b\u7570\u5e38\uff0c\u5217\u8868\u5448\u73fe\u57fa\u672c\u8a0a\u606f\uff0c\u5f85\u7ba1\u7406\u8005\u8655\u7406\u78ba\u8a8d\u3002'
              }
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800">
            {'\u5f85\u78ba\u8a8d '}
            {realtimeGenAlerts.length} {'\u4ef6'}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[720px] w-full">
            <thead className={thRow}>
              <tr>
                <th className="px-3 py-2 text-left">{'\u4ee3\u7406\u4eba'}</th>
                <th className="px-3 py-2 text-left">{'\u6848\u5834'}</th>
                <th className="px-3 py-2 text-left">{'\u7570\u5e38\u985e\u578b'}</th>
                <th className="px-3 py-2 text-left">{'\u72c0\u614b\u6458\u8981'}</th>
                <th className="px-3 py-2 text-left">{'\u6700\u5f8c\u56de\u50b3'}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {realtimeGenAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                    {'\u6240\u9078\u65e5\u671f\u5340\u9593\u5167\u7121\u5373\u6642\u767c\u96fb\u7570\u5e38\u7d00\u9304'}
                  </td>
                </tr>
              ) : (
                realtimeGenAlerts.map((row, i) => (
                  <tr key={`rt-${i}`} className="font-semibold">
                    <td className={td}>{agentName(row.agentId)}</td>
                    <td className={td}>{row.site}</td>
                    <td className={td}>
                      <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-black text-amber-900">
                        {row.kind}
                      </span>
                    </td>
                    <td className={`${td} max-w-md`}>{row.summary}</td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{row.lastAt}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionShell}>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {'\u4e8c\u3001\u7533\u5831\u8a08\u5283\u76e3\u63a7'}
            </h3>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
              {
                '\u4ee3\u7406\u4eba\u9808\u65bc\u5be6\u969b\u5132\u80fd\u79fb\u8f49\u524d\uff0c\u78ba\u8a8d\u81ea\u6392\u7a0b\u5df2\u5982\u671f\u4e0a\u50b3\uff1b\u7570\u5e38\u6642\u986f\u793a\u6458\u8981\u4e26\u5f85\u7ba1\u7406\u8005\u78ba\u8a8d\u3002'
              }
            </p>
          </div>
          <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800">
            {'\u5f85\u78ba\u8a8d '}
            {declarationAlerts.length} {'\u4ef6'}
          </span>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[760px] w-full">
            <thead className={thRow}>
              <tr>
                <th className="px-3 py-2 text-left">{'\u4ee3\u7406\u4eba'}</th>
                <th className="px-3 py-2 text-left">{'\u6392\u7a0b\uff0f\u6279\u6b21'}</th>
                <th className="px-3 py-2 text-left">{'\u4e0a\u50b3\u72c0\u614b'}</th>
                <th className="px-3 py-2 text-left">{'\u7570\u5e38\u6458\u8981'}</th>
                <th className="px-3 py-2 text-left">{'\u6642\u9650'}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {declarationAlerts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                    {'\u6240\u9078\u65e5\u671f\u5340\u9593\u5167\u7121\u7533\u5831\u8a08\u5283\u7570\u5e38'}
                  </td>
                </tr>
              ) : (
                declarationAlerts.map((row, i) => (
                  <tr key={`dec-${i}`} className="font-semibold">
                    <td className={td}>{agentName(row.agentId)}</td>
                    <td className={td}>{row.batch}</td>
                    <td className={td}>
                      <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-900">
                        {row.uploadStatus}
                      </span>
                    </td>
                    <td className={`${td} max-w-md`}>{row.summary}</td>
                    <td className={`${td} whitespace-nowrap text-slate-600`}>{row.deadline}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionShell}>
        <div className="border-b border-slate-200 pb-4">
          <h3 className="text-lg font-bold text-slate-900">
            {'\u4e09\u3001\u6aa2\u6838\u4f5c\u696d\u7570\u5e38\u76e3\u63a7'}
          </h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
            {
              '\u5404\u4ee3\u7406\u4eba\u5e33\u865f\u4e0b\uff0c\u6574\u5408 4.1 \u65e5\u6aa2\u6838\u8207 4.2 \u6708\u6aa2\u6838\u4e4b\u7570\u5e38\u72c0\u614b\uff0c\u65bc\u6b64\u5340\u7d9c\u6574\u986f\u793a\uff08\u4f9d\u5168\u9801\u67e5\u8a62\u5340\u9593\u672b\u65e5\u532f\u7e3d\uff09\u3002'
            }
          </p>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[800px] w-full">
            <thead className={thRow}>
              <tr>
                <th className="px-3 py-2 text-left">{'\u4ee3\u7406\u4eba'}</th>
                <th className="px-3 py-2 text-left">{'4.1 \u65e5\u6aa2\u6838'}</th>
                <th className="px-3 py-2 text-left">{'4.2 \u6708\u6aa2\u6838'}</th>
                <th className="px-3 py-2 text-left">{'\u7d9c\u6574\u8aaa\u660e'}</th>
              </tr>
            </thead>
            <tbody className="bg-white">
              {checkingSummary.map((row, i) => (
                <tr key={`chk-${i}`} className="font-semibold">
                  <td className={td}>{agentName(row.agentId)}</td>
                  <td className={td}>
                    {row.daily.startsWith(normalPrefix) ? (
                      <span className="text-emerald-700">{row.daily}</span>
                    ) : (
                      <span className="text-rose-800">{row.daily}</span>
                    )}
                  </td>
                  <td className={td}>
                    {row.monthly.startsWith(normalPrefix) ? (
                      <span className="text-emerald-700">{row.monthly}</span>
                    ) : (
                      <span className="text-rose-800">{row.monthly}</span>
                    )}
                  </td>
                  <td className={`${td} text-slate-700`}>{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={sectionShell}>
        <div className="border-b border-slate-200 pb-4">
          <h3 className="text-lg font-bold text-slate-900">{'\u56db\u3001\u7d50\u7b97\u76e3\u63a7'}</h3>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">
            {
              '\u7570\u5e38\u5206\u6790\u5831\u8868\u8207\u6548\u76ca\u7522\u51fa\u5831\u8868\uff1a\u524d\u8005\u8ffd\u8e64\u79fb\u8f49\u5931\u6548\u8207\u7d50\u7b97\u6263\u9664\uff1b\u5f8c\u8005\u5448\u73fe\u5132\u80fd\u79fb\u8f49\u6548\u76ca\u8207\u5e02\u5834\u89c0\u9ede\u4e0b\u4e4b\u4e0d\u5e73\u8861\u96fb\u91cf\u5831\u544a\u3002\u672c\u5340\u584a\u53ef\u7368\u7acb\u8a2d\u5b9a\u67e5\u8a62\u689d\u4ef6\uff0c\u4e0d\u5f71\u97ff\u4e0a\u65b9\u5340\u584a\u4e00\uff5e\u4e09\u3002'
            }
          </p>
          <div className="mt-4">
            <DateQueryToolbar
              title={'\u7d50\u7b97\u76e3\u63a7\u67e5\u8a62\u689d\u4ef6\uff08\u5340\u584a\u56db\u5c08\u7528\uff09'}
              query={settlementQuery}
              onChange={handleSettlementQueryChange}
              agents={agents}
              compact
            />
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <h4 className="text-base font-black text-slate-900">
              {'1. \u7570\u5e38\u5206\u6790\u5831\u8868'}
            </h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {'\u5404\u4ee3\u7406\u4eba\u5e33\u865f\uff1a\u79fb\u8f49\u96fb\u80fd\u5931\u6548\u91cf\u8207\u7d50\u7b97\u6263\u9664\u91cf \u00b7 '}
              {formatQuerySummary(settlementQuery)}
            </p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="min-w-[640px] w-full">
                <thead className={thRow}>
                  <tr>
                    <th className="px-3 py-2 text-left">{'\u4ee3\u7406\u4eba'}</th>
                    <th className="px-3 py-2 text-right">
                      {'\u79fb\u8f49\u96fb\u80fd\u5931\u6548\u91cf\uff08MWh\uff09'}
                    </th>
                    <th className="px-3 py-2 text-right">{'\u7d50\u7b97\u6263\u9664\u91cf\uff08MWh\uff09'}</th>
                    <th className="px-3 py-2 text-left">{'\u5099\u8a3b'}</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {settlementAbnormal.map((row, i) => (
                    <tr key={`set-ab-${i}`} className="font-semibold">
                      <td className={td}>{agentName(row.agentId)}</td>
                      <td className={`${td} text-right tabular-nums`}>{row.invalidMWh}</td>
                      <td className={`${td} text-right tabular-nums`}>{row.deductionMWh}</td>
                      <td className={`${td} text-slate-600`}>{row.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 className="text-base font-black text-slate-900">
              {'2. \u6548\u76ca\u7522\u51fa\u5831\u8868'}
            </h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {'\u67e5\u8a62\u5340\u9593\uff1a'}
              {formatQuerySummary(settlementQuery)}
              {settlementQuery.mode === 'month' && !imbalanceDrillDate && (
                <span className="ml-2 text-indigo-800">
                  {'\u00b7 \u4e0d\u5e73\u8861\u5831\u544a\u4ee5\u6bcf\u65e5\u5217\u5448\u73fe\uff0c\u53ef\u9ede\u65e5\u671f\u4e0b\u9477'}
                </span>
              )}
            </p>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-bold text-slate-900">
                  {'\uff081\uff09\u5132\u80fd\u79fb\u8f49\u6548\u76ca'}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {
                    '\u4f9d\u6aa2\u6838\u901a\u904e\u4e4b\u5206\u914d\u7d50\u679c\uff0c\u8a08\u7b97\u5404\u96fb\u865f\u8f49\u4f9b\u96fb\u91cf\u53ca\u5132\u80fd\u79fb\u8f49\u96fb\u91cf\u6bd4\u4f8b\u3002'
                  }
                </p>
                <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-[520px] w-full">
                    <thead className={thRow}>
                      <tr>
                        <th className="px-3 py-2 text-left">{'\u96fb\u865f'}</th>
                        <th className="px-3 py-2 text-right">{'\u8f49\u4f9b\u96fb\u91cf\uff08kWh\uff09'}</th>
                        <th className="px-3 py-2 text-right">
                          {'\u5132\u80fd\u79fb\u8f49\u96fb\u91cf\uff08kWh\uff09'}
                        </th>
                        <th className="px-3 py-2 text-right">{'\u6bd4\u4f8b\uff08%\uff09'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storageBenefitRows.map((r) => (
                        <tr key={r.meterNo} className="font-semibold">
                          <td className={td}>{r.meterNo}</td>
                          <td className={`${td} text-right tabular-nums`}>{r.transferKWh.toLocaleString()}</td>
                          <td className={`${td} text-right tabular-nums text-indigo-800`}>
                            {r.storageTransferKWh.toLocaleString()}
                          </td>
                          <td className={`${td} text-right tabular-nums text-emerald-800`}>
                            {r.ratioPct.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-bold text-slate-900">
                  {'\uff082\uff09\u4e0d\u5e73\u8861\u96fb\u91cf\u5831\u544a\uff08\u5e02\u5834\u89c0\u9ede\uff09'}
                </p>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {
                    '\u5408\u7d04\u8f49\u4f9b\u91cf\u70ba\u8a72 15 \u5206\u9418\u5340\u9593 min(\u767c\u96fb,\u7528\u96fb)\uff08\u8ce3\u8cb7\u540c\u503c\uff09\uff1b\u7d50\u7b97\u767c\u96fb\u3001\u7528\u96fb\u91cf\u8207 2.3 AMI \u5340\u9593\u52a0\u7e3d\u76f8\u540c\u3002\u50c5\u672a\u514c\u73fe\u5e02\u5834\u627f\u8afe\u8a08\u5165\u53ef\u8a08\u7f70\u4e0d\u5e73\u8861\u3002'
                  }
                </p>
                <ImbalanceReportTable
                  dailyRows={imbalanceDailyRows}
                  drillDate={imbalanceDrillDate}
                  agentIdFilter={settlementQuery.agentId}
                  onDrillDate={setImbalanceDrillDate}
                  onBack={() => setImbalanceDrillDate(null)}
                />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
