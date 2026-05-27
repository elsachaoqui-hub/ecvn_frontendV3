import { AGENTS, type Agent } from '@/data/agentAggregation';
import {
  ALL_AGENTS_ID,
  agentFilterLabel,
  buildDeclarationAlerts,
  buildRealtimeGenAlerts,
  enumerateDateKeys,
  resolveScopedAgents,
  type DateQueryState,
} from '@/lib/marketMonitoringData';

export type NotifyChannel = 'SMS' | 'Email' | '平台通報';
export type NotifyStatus = '已送達' | '送達失敗' | '排程中' | '已重發';

export type DetectionRuleId =
  | 'heartbeat-timeout'
  | 'data-plausibility'
  | 'storage-stream'
  | 'storage-escalation'
  | 'declaration-deadline'
  | 'mvrn-upload-deadline';

export type NotificationTaskId =
  | 'realtime-gen'
  | 'storage'
  | 'declaration'
  | 'mvrn-upload';

export type ActiveAnomalyRow = {
  id: string;
  taskId: NotificationTaskId;
  agentId: number;
  target: string;
  ruleId: DetectionRuleId;
  ruleLabel: string;
  severity: '高' | '中';
  summary: string;
  detectedAt: string;
  channels: NotifyChannel[];
  autoNotified: boolean;
};

export type NotificationHistoryRow = {
  id: string;
  taskId: NotificationTaskId;
  taskLabel: string;
  agentId: number;
  recipient: string;
  channel: NotifyChannel;
  subject: string;
  status: NotifyStatus;
  sentAt: string;
  trigger: '自動' | '手動重發';
  relatedAnomalyId?: string;
};

export type PendingResendRow = {
  id: string;
  taskId: NotificationTaskId;
  agentId: number;
  recipient: string;
  channels: NotifyChannel[];
  lastSentAt: string;
  failReason?: string;
  summary: string;
};

function hashUnit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function agentName(agentId: number): string {
  return AGENTS.find((a) => a.id === agentId)?.name ?? `代理人 #${agentId}`;
}

const STORAGE_SITES = ['儲能站點 北區 A', '儲能站點 南區 B', '調頻儲能 C'];
const RECIPIENT_SUFFIX = ['（合格交易者）', '（代理人）', '（登記聯絡人）'];

function recipientFor(agentId: number, i: number): string {
  return `${agentName(agentId)}${RECIPIENT_SUFFIX[i % RECIPIENT_SUFFIX.length]}`;
}

function channelsFromSeed(seed: string): NotifyChannel[] {
  const all: NotifyChannel[] = ['SMS', 'Email', '平台通報'];
  const n = hashUnit(seed) > 0.7 ? 3 : hashUnit(`${seed}:n`) > 0.4 ? 2 : 1;
  return all.slice(0, n);
}

export function buildRealtimeGenAnomalies(
  dateKeys: string[],
  agentIdFilter = ALL_AGENTS_ID
): ActiveAnomalyRow[] {
  const alerts = buildRealtimeGenAlerts(dateKeys, agentIdFilter);
  return alerts.map((a, i) => {
    const isHeartbeat = a.kind === '通訊逾時' || a.kind === '量測缺漏';
    return {
      id: `rt-${a.dateKey}-${i}`,
      taskId: 'realtime-gen' as const,
      agentId: a.agentId,
      target: a.site,
      ruleId: isHeartbeat ? ('heartbeat-timeout' as const) : ('data-plausibility' as const),
      ruleLabel: isHeartbeat ? '通訊中斷偵測（Heartbeat & Timeout）' : '資料合理性與動態特徵檢查',
      severity: isHeartbeat ? ('高' as const) : ('中' as const),
      summary: a.summary,
      detectedAt: a.lastAt,
      channels: channelsFromSeed(`rt-ch:${a.dateKey}:${i}`),
      autoNotified: hashUnit(`rt-auto:${a.dateKey}:${i}`) > 0.15,
    };
  });
}

export function buildStorageAnomalies(
  dateKeys: string[],
  agentIdFilter = ALL_AGENTS_ID
): ActiveAnomalyRow[] {
  const scoped = resolveScopedAgents(agentIdFilter);
  const rows: ActiveAnomalyRow[] = [];
  for (const dateKey of dateKeys) {
    if (hashUnit(`${dateKey}:st`) < 0.42) continue;
    const agentId = scoped[Math.floor(hashUnit(`${dateKey}:st:a`) * scoped.length)].id;
    const i = rows.length;
    const internal = hashUnit(`${dateKey}:st:i`) > 0.35;
    rows.push({
      id: `st-${dateKey}-${i}`,
      taskId: 'storage',
      agentId,
      target: STORAGE_SITES[i % STORAGE_SITES.length],
      ruleId: internal ? 'storage-stream' : 'storage-escalation',
      ruleLabel: internal
        ? '資料串流異常（電力交易平台監控）'
        : '外部通知與催告（對代理商／儲能業者）',
      severity: internal ? '高' : '中',
      summary: internal
        ? '儲能設備回傳中斷或數值超出合理區間，前台已標示紅燈。'
        : '已逾催告門檻，需通知合格交易者或代理人補正通訊或資料。',
      detectedAt: `${dateKey.replace(/-/g, '/')} ${String(9 + Math.floor(hashUnit(`${dateKey}:st:h`) * 8)).padStart(2, '0')}:${String(Math.floor(hashUnit(`${dateKey}:st:m`) * 4) * 15).padStart(2, '0')}`,
      channels: channelsFromSeed(`st-ch:${dateKey}`),
      autoNotified: hashUnit(`st-auto:${dateKey}`) > 0.2,
    });
  }
  return rows;
}

export function buildDeclarationAnomalies(
  dateKeys: string[],
  agentIdFilter = ALL_AGENTS_ID
): ActiveAnomalyRow[] {
  const alerts = buildDeclarationAlerts(dateKeys, agentIdFilter);
  return alerts.map((a, i) => ({
    id: `dec-${a.dateKey}-${i}`,
    taskId: 'declaration' as const,
    agentId: a.agentId,
    target: a.batch,
    ruleId: 'declaration-deadline' as const,
    ruleLabel: '申報截止時間未收到預排程',
    severity: a.uploadStatus.includes('失敗') ? ('高' as const) : ('中' as const),
    summary: a.summary,
    detectedAt: a.deadline,
    channels: channelsFromSeed(`dec-ch:${a.dateKey}:${i}`),
    autoNotified: hashUnit(`dec-auto:${a.dateKey}:${i}`) > 0.18,
  }));
}

export function buildMvrnUploadAnomalies(agentIdFilter = ALL_AGENTS_ID): ActiveAnomalyRow[] {
  const scoped = resolveScopedAgents(agentIdFilter);
  const today = new Date();
  const day = today.getDate();
  const rows: ActiveAnomalyRow[] = [];
  for (const agent of scoped) {
    const overdue = hashUnit(`mvrn:${agent.id}:${today.getMonth()}`) > 0.55 || day > 7;
    if (!overdue && day <= 5) continue;
    rows.push({
      id: `mvrn-${agent.id}`,
      taskId: 'mvrn-upload',
      agentId: agent.id,
      target: `${today.getFullYear()}/${String(today.getMonth()).padStart(2, '0')} 電能轉供分配量`,
      ruleId: 'mvrn-upload-deadline',
      ruleLabel: '次月 7 日內須上傳分配量',
      severity: day > 7 ? '高' : '中',
      summary:
        day > 7
          ? '已逾次月 7 日上傳期限，系統將持續催告並列為分配檢核待補件。'
          : '接近上傳截止日，請代理人完成「電能轉供分配量」上傳供系統檢核。',
      detectedAt: `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/07 23:59`,
      channels: ['Email', '平台通報'],
      autoNotified: day > 6,
    });
  }
  return rows;
}

export function buildNotificationHistory(
  dateKeys: string[],
  taskFilter: NotificationTaskId | 'all',
  agentIdFilter = ALL_AGENTS_ID
): NotificationHistoryRow[] {
  const taskLabels: Record<NotificationTaskId, string> = {
    'realtime-gen': '即時發電量回傳',
    storage: '儲能設備回傳',
    declaration: '申報計劃異常',
    'mvrn-upload': 'MVRN 分配結果上傳',
  };
  const subjects: Record<NotificationTaskId, string[]> = {
    'realtime-gen': ['【告警】案場通訊／資料異常', '【催告】即時發電量回傳逾時'],
    storage: ['【告警】儲能資料串流異常', '【催告】儲能回傳資料待補正'],
    declaration: ['【告警】預排程提交逾時', '【通知】申報資料異常待確認'],
    'mvrn-upload': ['【提醒】MVRN 分配量上傳期限', '【催告】分配結果尚未上傳'],
  };

  const rows: NotificationHistoryRow[] = [];
  const tasks: NotificationTaskId[] =
    taskFilter === 'all'
      ? ['realtime-gen', 'storage', 'declaration', 'mvrn-upload']
      : [taskFilter];

  for (const dateKey of dateKeys) {
    for (const taskId of tasks) {
      const n = hashUnit(`${dateKey}:hist:${taskId}`) > 0.62 ? 2 : hashUnit(`${dateKey}:hist2:${taskId}`) > 0.35 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const scoped = resolveScopedAgents(agentIdFilter);
        const agentId = scoped[Math.floor(hashUnit(`${dateKey}:${taskId}:a:${i}`) * scoped.length)].id;
        const channels = channelsFromSeed(`${dateKey}:${taskId}:${i}`);
        const channel = channels[i % channels.length];
        const failed = hashUnit(`${dateKey}:${taskId}:f:${i}`) > 0.88;
        rows.push({
          id: `hist-${taskId}-${dateKey}-${i}`,
          taskId,
          taskLabel: taskLabels[taskId],
          agentId,
          recipient: recipientFor(agentId, i),
          channel,
          subject: subjects[taskId][i % subjects[taskId].length],
          status: failed ? '送達失敗' : hashUnit(`${dateKey}:rs:${i}`) > 0.92 ? '已重發' : '已送達',
          sentAt: `${dateKey.replace(/-/g, '/')} ${String(10 + i * 3).padStart(2, '0')}:${String(15 + i * 20).padStart(2, '0')}`,
          trigger: hashUnit(`${dateKey}:tr:${i}`) > 0.75 ? '手動重發' : '自動',
        });
      }
    }
  }
  return rows.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export function buildPendingResends(
  anomalies: ActiveAnomalyRow[],
  history: NotificationHistoryRow[]
): PendingResendRow[] {
  const failedHist = history.filter((h) => h.status === '送達失敗');
  const fromFailed: PendingResendRow[] = failedHist.map((h) => ({
    id: `resend-h-${h.id}`,
    taskId: h.taskId,
    agentId: h.agentId,
    recipient: h.recipient,
    channels: [h.channel],
    lastSentAt: h.sentAt,
    failReason: '通道回覆逾時或收件位址無效',
    summary: h.subject,
  }));

  const fromAnomaly: PendingResendRow[] = anomalies
    .filter((a) => !a.autoNotified || a.severity === '高')
    .slice(0, 6)
    .map((a, i) => ({
      id: `resend-a-${a.id}`,
      taskId: a.taskId,
      agentId: a.agentId,
      recipient: recipientFor(a.agentId, i),
      channels: a.channels,
      lastSentAt: a.detectedAt,
      failReason: a.autoNotified ? undefined : '自動通知尚未成功送出',
      summary: a.summary,
    }));

  const seen = new Set<string>();
  return [...fromFailed, ...fromAnomaly].filter((r) => {
    const key = `${r.taskId}:${r.agentId}:${r.recipient}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function summarizeByTask(anomalies: ActiveAnomalyRow[]) {
  const tasks: NotificationTaskId[] = ['realtime-gen', 'storage', 'declaration', 'mvrn-upload'];
  return tasks.map((taskId) => {
    const list = anomalies.filter((a) => a.taskId === taskId);
    return {
      taskId,
      total: list.length,
      high: list.filter((a) => a.severity === '高').length,
      pendingNotify: list.filter((a) => !a.autoNotified).length,
    };
  });
}

export { agentFilterLabel, enumerateDateKeys, type Agent, type DateQueryState, ALL_AGENTS_ID };
