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
import {
  ALL_AGENTS_ID,
  agentFilterLabel,
  agentName,
  buildDeclarationAnomalies,
  buildMvrnUploadAnomalies,
  buildNotificationHistory,
  buildPendingResends,
  buildRealtimeGenAnomalies,
  buildStorageAnomalies,
  enumerateDateKeys,
  summarizeByTask,
  type ActiveAnomalyRow,
  type DateQueryState,
  type NotificationHistoryRow,
  type NotificationTaskId,
  type NotifyChannel,
  type PendingResendRow,
} from '@/lib/notificationData';
import { formatQuerySummary, toDateInputValue, toMonthInputValue, type DateQueryMode } from '@/lib/marketMonitoringData';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const sectionShell = 'rounded-2xl border border-slate-300 bg-white p-5 shadow-sm';
const thRow = 'bg-slate-100 text-xs font-black uppercase tracking-wide text-slate-600';
const td = 'border-t border-slate-100 px-3 py-2.5 text-sm';

type TaskPanelTab = 'monitor' | 'resend' | 'history';

const TASK_META: Record<
  NotificationTaskId,
  { title: string; subtitle: string; rules: { label: string; desc: string; tone: string }[] }
> = {
  'realtime-gen': {
    title: '一、即時發電量資料回傳的監控與通知機制',
    subtitle:
      '若代理人旗下案場回傳的即時發電量狀態異常，系統將透過簡訊（SMS）、電子郵件（Email）或平台通報自動通知合格交易者或代理人；平台支援手動重發與歷史通知查詢。',
    rules: [
      {
        label: '（１）通訊中斷偵測',
        desc: 'Heartbeat & Timeout：逾時未收到回傳即標記異常並觸發通知。',
        tone: 'border-amber-200 bg-amber-50 text-amber-900',
      },
      {
        label: '（２）資料合理性與動態特徵檢查',
        desc: '比對前後刻度變化率、缺漏與量測合理性，異常時列入告警。',
        tone: 'border-indigo-200 bg-indigo-50 text-indigo-900',
      },
    ],
  },
  storage: {
    title: '二、儲能設備資料回傳的監控與通知機制',
    subtitle:
      '透過電力交易平台資料串流監控儲能回傳；異常時前台紅燈警示，並以 SMS／Email／平台通報通知代理商或儲能業者，支援手動重發與歷史查詢。',
    rules: [
      {
        label: '自動化即時告警',
        desc: '系統內部與前台：調度介面或交易平台前台跳出警示，狀態標示紅燈或異常。',
        tone: 'border-rose-200 bg-rose-50 text-rose-900',
      },
      {
        label: '外部通知與催告',
        desc: '對代理商／儲能業者：通訊或資料異常時自動發信／簡訊催告。',
        tone: 'border-violet-200 bg-violet-50 text-violet-900',
      },
    ],
  },
  declaration: {
    title: '三、申報計劃異常通知',
    subtitle:
      '實際電能轉移前設有截止時間；若平台未收到相關預排程則視為提交逾時，並以 SMS／Email／平台通報通知合格交易者或代理人。',
    rules: [
      {
        label: '預排程截止偵測',
        desc: '截止時間前未收到任何相關預排程上傳，列為申報資料異常。',
        tone: 'border-sky-200 bg-sky-50 text-sky-900',
      },
    ],
  },
  'mvrn-upload': {
    title: '四、MVRN 分配結果上傳通知',
    subtitle: '次月 7 日內，代理人須上傳系統「電能轉供的分配量」供分配檢核；逾期將持續提醒並記錄通知歷程。',
    rules: [
      {
        label: '上傳期限',
        desc: '每月 7 日 23:59 前完成上傳；接近或逾期限時發送提醒／催告通知。',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-900',
      },
    ],
  },
};

function defaultQuery(): DateQueryState {
  const today = toDateInputValue();
  const weekAgo = toDateInputValue(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  return { mode: 'range', start: weekAgo, end: today, month: toMonthInputValue(), agentId: ALL_AGENTS_ID };
}

function ChannelBadges({ channels }: { channels: NotifyChannel[] }) {
  const tone: Record<NotifyChannel, string> = {
    SMS: 'bg-blue-100 text-blue-900',
    Email: 'bg-slate-200 text-slate-800',
    平台通報: 'bg-indigo-100 text-indigo-900',
  };
  return (
    <div className="flex flex-wrap gap-1">
      {channels.map((c) => (
        <span key={c} className={`rounded-md px-2 py-0.5 text-xs font-black ${tone[c]}`}>
          {c}
        </span>
      ))}
    </div>
  );
}

function DateQueryToolbar({
  query,
  onChange,
}: {
  query: DateQueryState;
  onChange: (next: DateQueryState) => void;
}) {
  const setMode = (mode: DateQueryMode) => onChange({ ...query, mode });
  const { agents } = useRegistration();

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">歷史通知查詢條件</p>
          <p className="mt-1 text-sm font-bold text-indigo-900">{formatQuerySummary(query)}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ['range', '起訖區間'],
              ['single', '單日'],
              ['month', '整月'],
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
          <Label className="text-xs text-slate-600">代理人</Label>
          <Select value={query.agentId} onValueChange={(agentId) => onChange({ ...query, agentId })}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="選擇代理人" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_AGENTS_ID}>全部代理人（彙總）</SelectItem>
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
              <Label className="text-xs text-slate-600">查詢起日</Label>
              <Input
                type="date"
                className="w-40"
                value={query.start}
                max={query.end || undefined}
                onChange={(e) => onChange({ ...query, start: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-600">查詢迄日</Label>
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
            <Label className="text-xs text-slate-600">查詢日期</Label>
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
            <Label className="text-xs text-slate-600">查詢月份</Label>
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

function AnomalyTable({ rows, emptyText }: { rows: ActiveAnomalyRow[]; emptyText: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[920px] w-full">
        <thead className={thRow}>
          <tr>
            <th className="px-3 py-2 text-left">代理人</th>
            <th className="px-3 py-2 text-left">案場／標的</th>
            <th className="px-3 py-2 text-left">偵測規則</th>
            <th className="px-3 py-2 text-left">嚴重度</th>
            <th className="px-3 py-2 text-left">異常摘要</th>
            <th className="px-3 py-2 text-left">偵測時間</th>
            <th className="px-3 py-2 text-left">通知通道</th>
            <th className="px-3 py-2 text-left">自動通知</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="font-semibold">
                <td className={td}>{agentName(row.agentId)}</td>
                <td className={td}>{row.target}</td>
                <td className={td}>
                  <span className="text-xs font-bold text-slate-700">{row.ruleLabel}</span>
                </td>
                <td className={td}>
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-black ${
                      row.severity === '高' ? 'bg-rose-100 text-rose-900' : 'bg-amber-100 text-amber-900'
                    }`}
                  >
                    {row.severity}
                  </span>
                </td>
                <td className={`${td} max-w-sm text-slate-700`}>{row.summary}</td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{row.detectedAt}</td>
                <td className={td}>
                  <ChannelBadges channels={row.channels} />
                </td>
                <td className={td}>
                  {row.autoNotified ? (
                    <span className="text-emerald-700">已送出</span>
                  ) : (
                    <span className="text-rose-800">待補發</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function ResendTable({
  rows,
  onResend,
}: {
  rows: PendingResendRow[];
  onResend: (row: PendingResendRow) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[800px] w-full">
        <thead className={thRow}>
          <tr>
            <th className="px-3 py-2 text-left">代理人</th>
            <th className="px-3 py-2 text-left">收件對象</th>
            <th className="px-3 py-2 text-left">通知摘要</th>
            <th className="px-3 py-2 text-left">上次發送</th>
            <th className="px-3 py-2 text-left">建議通道</th>
            <th className="px-3 py-2 text-left">操作</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                目前無待重發項目
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="font-semibold">
                <td className={td}>{agentName(row.agentId)}</td>
                <td className={td}>{row.recipient}</td>
                <td className={`${td} max-w-md`}>
                  <div>{row.summary}</div>
                  {row.failReason && (
                    <div className="mt-1 text-xs font-semibold text-rose-700">原因：{row.failReason}</div>
                  )}
                </td>
                <td className={`${td} whitespace-nowrap text-slate-600`}>{row.lastSentAt}</td>
                <td className={td}>
                  <ChannelBadges channels={row.channels} />
                </td>
                <td className={td}>
                  <button
                    type="button"
                    onClick={() => onResend(row)}
                    className="rounded-full border border-slate-800 bg-slate-800 px-3 py-1 text-xs font-bold text-white hover:bg-slate-700"
                  >
                    手動重發
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryTable({ rows }: { rows: NotificationHistoryRow[] }) {
  const statusTone: Record<string, string> = {
    已送達: 'text-emerald-700',
    已重發: 'text-indigo-800',
    送達失敗: 'text-rose-800',
    排程中: 'text-amber-800',
  };
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200">
      <table className="min-w-[900px] w-full">
        <thead className={thRow}>
          <tr>
            <th className="px-3 py-2 text-left">發送時間</th>
            <th className="px-3 py-2 text-left">任務</th>
            <th className="px-3 py-2 text-left">代理人</th>
            <th className="px-3 py-2 text-left">收件對象</th>
            <th className="px-3 py-2 text-left">通道</th>
            <th className="px-3 py-2 text-left">主旨</th>
            <th className="px-3 py-2 text-left">觸發</th>
            <th className="px-3 py-2 text-left">狀態</th>
          </tr>
        </thead>
        <tbody className="bg-white">
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-sm font-semibold text-slate-500">
                所選區間內無通知紀錄
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id} className="font-semibold">
                <td className={`${td} whitespace-nowrap text-slate-600`}>{row.sentAt}</td>
                <td className={td}>{row.taskLabel}</td>
                <td className={td}>{agentName(row.agentId)}</td>
                <td className={td}>{row.recipient}</td>
                <td className={td}>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-800">
                    {row.channel}
                  </span>
                </td>
                <td className={`${td} max-w-xs text-slate-700`}>{row.subject}</td>
                <td className={td}>{row.trigger}</td>
                <td className={`${td} font-black ${statusTone[row.status] ?? 'text-slate-700'}`}>{row.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TaskSection({
  taskId,
  anomalies,
  pendingResends,
  history,
  query,
  onQueryChange,
  badgeCount,
}: {
  taskId: NotificationTaskId;
  anomalies: ActiveAnomalyRow[];
  pendingResends: PendingResendRow[];
  history: NotificationHistoryRow[];
  query: DateQueryState;
  onQueryChange: (q: DateQueryState) => void;
  badgeCount: number;
}) {
  const meta = TASK_META[taskId];
  const [tab, setTab] = useState<TaskPanelTab>('monitor');
  const taskResends = pendingResends.filter((r) => r.taskId === taskId);
  const taskHistory = history.filter((h) => h.taskId === taskId);

  const handleResend = (row: PendingResendRow) => {
    toast.success(`已排程手動重發`, {
      description: `${agentName(row.agentId)} · ${row.channels.join('、')} · ${row.summary.slice(0, 40)}…`,
    });
  };

  const tabs: { id: TaskPanelTab; label: string }[] = [
    { id: 'monitor', label: '異常監控' },
    { id: 'resend', label: `手動重發（${taskResends.length}）` },
    { id: 'history', label: '歷史通知' },
  ];

  return (
    <section className={sectionShell}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-900">{meta.title}</h3>
          <p className="mt-2 max-w-4xl text-sm font-semibold text-slate-600">{meta.subtitle}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {meta.rules.map((rule) => (
              <div
                key={rule.label}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold ${rule.tone}`}
              >
                <span className="font-black">{rule.label}</span>
                <span className="ml-2 opacity-90">{rule.desc}</span>
              </div>
            ))}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800">
          待處理 {badgeCount} 件
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-4 py-1.5 text-xs font-bold transition-colors ${
              tab === t.id
                ? 'border-slate-800 bg-slate-800 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'monitor' && (
          <AnomalyTable
            rows={anomalies}
            emptyText="目前無偵測到異常，或所選代理人／區間內無資料。"
          />
        )}
        {tab === 'resend' && (
          <>
            <p className="mb-3 text-xs font-semibold text-slate-600">
              除系統自動發送外，管理者可對送達失敗或待補發項目執行手動重發（SMS／Email／平台通報）。
            </p>
            <ResendTable rows={taskResends} onResend={handleResend} />
          </>
        )}
        {tab === 'history' && (
          <>
            <div className="mb-4">
              <DateQueryToolbar query={query} onChange={onQueryChange} />
            </div>
            <HistoryTable rows={taskHistory} />
          </>
        )}
      </div>
    </section>
  );
}

export default function NotificationPage() {
  const [query, setQuery] = useState(defaultQuery);
  const dateKeys = useMemo(() => enumerateDateKeys(query), [query]);

  const realtimeAnomalies = useMemo(
    () => buildRealtimeGenAnomalies(dateKeys, query.agentId),
    [dateKeys, query.agentId]
  );
  const storageAnomalies = useMemo(
    () => buildStorageAnomalies(dateKeys, query.agentId),
    [dateKeys, query.agentId]
  );
  const declarationAnomalies = useMemo(
    () => buildDeclarationAnomalies(dateKeys, query.agentId),
    [dateKeys, query.agentId]
  );
  const mvrnAnomalies = useMemo(() => buildMvrnUploadAnomalies(query.agentId), [query.agentId]);

  const allAnomalies = useMemo(
    () => [...realtimeAnomalies, ...storageAnomalies, ...declarationAnomalies, ...mvrnAnomalies],
    [realtimeAnomalies, storageAnomalies, declarationAnomalies, mvrnAnomalies]
  );

  const history = useMemo(
    () => buildNotificationHistory(dateKeys, 'all', query.agentId),
    [dateKeys, query.agentId]
  );

  const pendingResends = useMemo(
    () => buildPendingResends(allAnomalies, history),
    [allAnomalies, history]
  );

  const summary = useMemo(() => summarizeByTask(allAnomalies), [allAnomalies]);

  const countFor = (taskId: NotificationTaskId) =>
    summary.find((s) => s.taskId === taskId)?.total ?? 0;

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      <section className={sectionShell}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">7.1 通知｜平台通報與催告中心</h3>
            <p className="mt-2 max-w-4xl text-sm font-semibold text-slate-600">
              整合即時發電量、儲能回傳、申報計劃與 MVRN 分配上傳等四大通知任務。異常偵測後自動以簡訊、電子郵件或平台通報通知合格交易者／代理人，並提供手動重發與歷史查詢。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700">
              {agentFilterLabel(query.agentId)}
            </span>
            <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-800">
              全任務異常 {allAnomalies.length} 件
            </span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.map((s) => {
            const labels: Record<NotificationTaskId, string> = {
              'realtime-gen': '一、即時發電量',
              storage: '二、儲能回傳',
              declaration: '三、申報計劃',
              'mvrn-upload': '四、MVRN 上傳',
            };
            const colors = ['border-amber-200 bg-amber-50', 'border-violet-200 bg-violet-50', 'border-sky-200 bg-sky-50', 'border-emerald-200 bg-emerald-50'];
            const idx = ['realtime-gen', 'storage', 'declaration', 'mvrn-upload'].indexOf(s.taskId);
            return (
              <div
                key={s.taskId}
                className={`rounded-xl border p-4 ${colors[idx] ?? 'border-slate-200 bg-slate-50'}`}
              >
                <div className="text-xs font-black text-slate-600">{labels[s.taskId]}</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{s.total}</div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold">
                  <span className="text-rose-800">高嚴重度 {s.high}</span>
                  <span className="text-amber-800">待補發 {s.pendingNotify}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">全頁查詢（影響各區塊異常與歷史）</p>
          <div className="mt-2">
            <DateQueryToolbar query={query} onChange={setQuery} />
          </div>
        </div>
      </section>

      <TaskSection
        taskId="realtime-gen"
        anomalies={realtimeAnomalies}
        pendingResends={pendingResends}
        history={history}
        query={query}
        onQueryChange={setQuery}
        badgeCount={countFor('realtime-gen')}
      />
      <TaskSection
        taskId="storage"
        anomalies={storageAnomalies}
        pendingResends={pendingResends}
        history={history}
        query={query}
        onQueryChange={setQuery}
        badgeCount={countFor('storage')}
      />
      <TaskSection
        taskId="declaration"
        anomalies={declarationAnomalies}
        pendingResends={pendingResends}
        history={history}
        query={query}
        onQueryChange={setQuery}
        badgeCount={countFor('declaration')}
      />
      <TaskSection
        taskId="mvrn-upload"
        anomalies={mvrnAnomalies}
        pendingResends={pendingResends}
        history={history}
        query={query}
        onQueryChange={setQuery}
        badgeCount={countFor('mvrn-upload')}
      />

      <p className="text-xs font-semibold text-slate-500">
        註：本頁為示範介面，通知內容與偵測結果使用假資料產生，供操作流程與版面定稿；之後可串接告警引擎、簡訊／郵件閘道與通知歷程 API。
      </p>
    </div>
  );
}
