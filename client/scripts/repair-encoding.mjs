/**
 * 修復 SettlementPreSettlementPage.tsx 亂碼：
 * 1. 從 66b5074 還原（最後一版中文正常的 commit）
 * 2. 以 UTF-8 重新套用 CSV / 互動 patch
 * 3. CSV 重新產生並加上 UTF-8 BOM（Excel 可正確開啟）
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const pagePath = path.join(root, 'src/components/SettlementPreSettlementPage.tsx');
const GOOD_COMMIT = '66b5074';

function rep(src, from, to, label) {
  const a = from.replace(/\n/g, '\r\n');
  const b = to.replace(/\n/g, '\r\n');
  if (src.includes(from)) return src.replace(from, to);
  if (src.includes(a)) return src.replace(a, b);
  throw new Error(`MISSING [${label}]: ${from.slice(0, 80)}`);
}

// --- 1. Restore good base ---
const goodBuf = execSync(`git show ${GOOD_COMMIT}:client/src/components/SettlementPreSettlementPage.tsx`, {
  encoding: 'buffer',
  maxBuffer: 20 * 1024 * 1024,
});
let src = goodBuf.toString('utf8');
if (!src.includes('預結算') || !src.includes('一月')) {
  throw new Error(`Base commit ${GOOD_COMMIT} does not contain valid Chinese`);
}
console.log('Restored from', GOOD_COMMIT, '- 預結算 OK');

// --- 2. Apply CSV / dialog patches (same as patch-presettlement-detail.mjs) ---
src = rep(
  src,
  `import SettlementEnergyFlowSankey, {
  type EnergyFlowAggregate,
  type EnergyFlowDrill,
} from '@/components/SettlementEnergyFlowSankey';`,
  `import SettlementEnergyFlowSankey, {
  type EnergyFlowAggregate,
  type EnergyFlowDrill,
  type SankeyClickPayload,
} from '@/components/SettlementEnergyFlowSankey';
import SankeyDetailDialog, {
  type SankeyDetailFocus,
  type SankeyMetricFocus,
} from '@/components/SankeyDetailDialog';
import { buildSankeyChartFromDates, loadSankeyExplorerDataset } from '@/lib/sankeyExplorerCsv';`,
  'imports'
);

src = rep(
  src,
  `const SANKEY_VENDOR_CONFIRMED_BTN =
  'rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-200';`,
  `const SANKEY_VENDOR_CONFIRMED_BTN =
  'rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-200';

const SANKEY_METRIC_CELL_BTN =
  'cursor-pointer tabular-nums underline-offset-2 hover:text-indigo-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';

function SankeyMetricButton({
  value,
  decimals = 3,
  className = '',
  onClick,
}: {
  value: number;
  decimals?: number;
  className?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className={\`\${SANKEY_METRIC_CELL_BTN} \${className}\`} onClick={onClick}>
      {value.toFixed(decimals)}
    </button>
  );
}`,
  'SankeyMetricButton'
);

// Replace sankeyDetailRows block - use regex for multiline
src = src.replace(
  /  const sankeyDetailRows = useMemo\(\(\) => \{[\s\S]*?return ascRows\.reverse\(\);\s*\}, \[\]\);/,
  `  const sankeyExplorerDataset = useMemo(() => loadSankeyExplorerDataset(), []);
  const sankeyDetailRows = sankeyExplorerDataset.dailyRows;`
);

src = rep(
  src,
  `  const explorerQuarterRows = useMemo(() => {
    if (!sankeyExplorerDay) return [];
    const hourly = buildHourlyRowsByDate(sankeyExplorerDay);
    return expandHourlyToQuarterRows(hourly, sankeyExplorerDay);
  }, [sankeyExplorerDay]);`,
  `  const explorerQuarterRows = useMemo(() => {
    if (!sankeyExplorerDay) return [];
    return sankeyExplorerDataset.quarterRowsByDate.get(sankeyExplorerDay) ?? [];
  }, [sankeyExplorerDay, sankeyExplorerDataset]);`,
  'explorerQuarterRows'
);

src = rep(
  src,
  `  const [saveToast, setSaveToast] = useState(false);`,
  `  const [saveToast, setSaveToast] = useState(false);
  const [detailFocus, setDetailFocus] = useState<SankeyDetailFocus | null>(null);

  const detailPeriodDates = useMemo(() => {
    if (sankeyExplorerView === 'quarter' && sankeyExplorerDay) return [sankeyExplorerDay];
    if (sankeyExplorerView === 'daily' && sankeyExplorerMonth != null) {
      return sankeyDailyRowsForExplorer.map((r) => r.dateLabel);
    }
    return (sankeyDetailRows as SankeyDetailDayRow[])
      .filter((r) => r.dateLabel.startsWith(\`\${sankeyExplorerYear}-\`))
      .map((r) => r.dateLabel);
  }, [
    sankeyDailyRowsForExplorer,
    sankeyDetailRows,
    sankeyExplorerDay,
    sankeyExplorerMonth,
    sankeyExplorerView,
    sankeyExplorerYear,
  ]);

  const sankeyFlowLinks = useMemo(
    () => buildSankeyChartFromDates(detailPeriodDates),
    [detailPeriodDates]
  );

  const openPeriodMetric = useCallback(
    (metric: SankeyMetricFocus, dateLabels: string[], periodLabel: string) => {
      setDetailFocus({ kind: 'period', periodLabel, dateLabels, metric });
    },
    []
  );

  const openSlotMetric = useCallback(
    (timeLabel: string, metric: SankeyMetricFocus) => {
      if (!sankeyExplorerDay) return;
      setDetailFocus({
        kind: 'slot',
        periodLabel: sankeyExplorerDay,
        dateLabel: sankeyExplorerDay,
        timeLabel,
        metric,
      });
    },
    [sankeyExplorerDay]
  );

  const handleSankeyInteraction = useCallback(
    (payload: SankeyClickPayload) => {
      if (payload.type === 'node') {
        setDetailFocus({
          kind: 'node',
          periodLabel: energyFlowAggregate.periodLabel,
          dateLabels: detailPeriodDates,
          nodeName: payload.name,
        });
      } else {
        setDetailFocus({
          kind: 'edge',
          periodLabel: energyFlowAggregate.periodLabel,
          dateLabels: detailPeriodDates,
          sourceNode: payload.source,
          targetNode: payload.target,
        });
      }
    },
    [detailPeriodDates, energyFlowAggregate.periodLabel]
  );

  const monthDateLabels = useCallback(
    (month: number) =>
      (sankeyDetailRows as SankeyDetailDayRow[])
        .filter((r) => {
          const [, mm] = r.dateLabel.split('-');
          return r.dateLabel.startsWith(\`\${sankeyExplorerYear}-\`) && Number(mm) === month;
        })
        .map((r) => r.dateLabel),
    [sankeyDetailRows, sankeyExplorerYear]
  );`,
  'detailFocus'
);

src = rep(
  src,
  `          <SettlementEnergyFlowSankey drill={energyFlowDrill} aggregate={energyFlowAggregate} embedded />`,
  `          <SettlementEnergyFlowSankey
            drill={energyFlowDrill}
            aggregate={energyFlowAggregate}
            flowLinks={sankeyFlowLinks}
            embedded
            onSankeyInteraction={handleSankeyInteraction}
          />`,
  'Sankey component'
);

src = rep(
  src,
  `            分鐘可編輯量測值並填寫原因；異常以紅色標示，廠商確認後改為綠色。`,
  `            分鐘可編輯量測值並填寫原因；異常以紅色標示，廠商確認後改為綠色。表格數值與上方桑基圖節點／連線可點擊，開啟 G1～G5、L1～L5 與流向組成明細。`,
  'hint text'
);

// Table clickable cells (year)
src = rep(
  src,
  `<td className="px-3 py-2 text-right tabular-nums">{z.generation.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{z.load.toFixed(1)}</td>`,
  `<td className="px-3 py-2 text-right">
                          <SankeyMetricButton
                            value={z.generation}
                            decimals={1}
                            onClick={() =>
                              openPeriodMetric(
                                'generation',
                                monthDateLabels(month),
                                \`\${sankeyExplorerYear} 年 \${label}\`
                              )
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <SankeyMetricButton
                            value={z.load}
                            decimals={1}
                            onClick={() =>
                              openPeriodMetric('load', monthDateLabels(month), \`\${sankeyExplorerYear} 年 \${label}\`)
                            }
                          />
                        </td>`,
  'year gen/load'
);

src = rep(
  src,
  `<td className="px-3 py-2 text-right tabular-nums font-semibold">{z.storageBalance.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-blue-700">{z.contractMatched.toFixed(1)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{z.totalMatched.toFixed(1)}</td>`,
  `<td className="px-3 py-2 text-right">
                          <SankeyMetricButton
                            value={z.storageBalance}
                            decimals={1}
                            onClick={() =>
                              openPeriodMetric('balance', monthDateLabels(month), \`\${sankeyExplorerYear} 年 \${label}\`)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right text-blue-700">
                          <SankeyMetricButton
                            value={z.contractMatched}
                            decimals={1}
                            className="text-blue-700"
                            onClick={() =>
                              openPeriodMetric('contract', monthDateLabels(month), \`\${sankeyExplorerYear} 年 \${label}\`)
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-semibold text-blue-700">
                          <SankeyMetricButton
                            value={z.totalMatched}
                            decimals={1}
                            className="text-blue-700"
                            onClick={() =>
                              openPeriodMetric('total', monthDateLabels(month), \`\${sankeyExplorerYear} 年 \${label}\`)
                            }
                          />
                        </td>`,
  'year balance'
);

// Daily table
src = rep(
  src,
  `<td className="px-3 py-2 text-right tabular-nums">{row.generation.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.load.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.storageIn.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{row.storageOut.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{row.storageBalance.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{row.contractMatched.toFixed(1)}</td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold text-blue-700">{row.totalMatched.toFixed(1)}</td>`,
  `<td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.generation}
                              decimals={1}
                              onClick={() => openPeriodMetric('generation', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.load}
                              decimals={1}
                              onClick={() => openPeriodMetric('load', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.storageIn}
                              decimals={1}
                              onClick={() => openPeriodMetric('storageIn', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <SankeyMetricButton
                              value={row.storageOut}
                              decimals={1}
                              onClick={() => openPeriodMetric('storageOut', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <SankeyMetricButton
                              value={row.storageBalance}
                              decimals={1}
                              onClick={() => openPeriodMetric('balance', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right text-blue-700">
                            <SankeyMetricButton
                              value={row.contractMatched}
                              decimals={1}
                              className="text-blue-700"
                              onClick={() => openPeriodMetric('contract', [row.dateLabel], row.dateLabel)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">
                            <SankeyMetricButton
                              value={row.totalMatched}
                              decimals={1}
                              className="text-blue-700"
                              onClick={() => openPeriodMetric('total', [row.dateLabel], row.dateLabel)}
                            />
                          </td>`,
  'daily cells'
);

// Quarter gen/load
src = rep(
  src,
  `                          <td className={\`px-3 py-2 text-right tabular-nums \${genCls}\`}>
                            {genEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{gen0.toFixed(3)}</span>{' '}
                                <span className="font-semibold text-emerald-600">({gen.toFixed(3)})</span>
                              </>
                            ) : (
                              gen0.toFixed(3)
                            )}
                          </td>
                          <td className={\`px-3 py-2 text-right tabular-nums \${loadCls}\`}>
                            {loadEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{load0.toFixed(3)}</span>{' '}
                                <span className="font-semibold text-emerald-600">({load.toFixed(3)})</span>
                              </>
                            ) : (
                              load0.toFixed(3)
                            )}
                          </td>`,
  `                          <td className={\`px-3 py-2 text-right tabular-nums \${genCls}\`}>
                            {genEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{gen0.toFixed(3)}</span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'generation')}
                                >
                                  ({gen.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={gen0}
                                className={genCls}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'generation')}
                              />
                            )}
                          </td>
                          <td className={\`px-3 py-2 text-right tabular-nums \${loadCls}\`}>
                            {loadEdited ? (
                              <>
                                <span className="text-slate-900 line-through">{load0.toFixed(3)}</span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'load')}
                                >
                                  ({load.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={load0}
                                className={loadCls}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'load')}
                              />
                            )}
                          </td>`,
  'quarter gen/load'
);

src = rep(
  src,
  `                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {storageEdited ? (
                              <>
                                <span className="text-slate-900 line-through">
                                  {Math.max(storage0, 0).toFixed(3)}
                                </span>{' '}
                                <span className="font-semibold text-emerald-600">({line.stIn.toFixed(3)})</span>
                              </>
                            ) : (
                              line.stIn.toFixed(3)
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {storageEdited ? (
                              <>
                                <span className="text-slate-900 line-through">
                                  {Math.max(-storage0, 0).toFixed(3)}
                                </span>{' '}
                                <span className="font-semibold text-emerald-600">({line.stOut.toFixed(3)})</span>
                              </>
                            ) : (
                              line.stOut.toFixed(3)
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{line.runBalance.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-blue-700">{line.contractMatched.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">{line.totalMatched.toFixed(3)}</td>`,
  `                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {storageEdited ? (
                              <>
                                <span className="text-slate-900 line-through">
                                  {Math.max(storage0, 0).toFixed(3)}
                                </span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'storageIn')}
                                >
                                  ({line.stIn.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={line.stIn}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'storageIn')}
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {storageEdited ? (
                              <>
                                <span className="text-slate-900 line-through">
                                  {Math.max(-storage0, 0).toFixed(3)}
                                </span>{' '}
                                <button
                                  type="button"
                                  className="font-semibold text-emerald-600 underline-offset-2 hover:underline"
                                  onClick={() => openSlotMetric(line.row.timeLabel, 'storageOut')}
                                >
                                  ({line.stOut.toFixed(3)})
                                </button>
                              </>
                            ) : (
                              <SankeyMetricButton
                                value={line.stOut}
                                onClick={() => openSlotMetric(line.row.timeLabel, 'storageOut')}
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold">
                            <SankeyMetricButton
                              value={line.runBalance}
                              onClick={() => openSlotMetric(line.row.timeLabel, 'balance')}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right text-blue-700">
                            <SankeyMetricButton
                              value={line.contractMatched}
                              className="text-blue-700"
                              onClick={() => openSlotMetric(line.row.timeLabel, 'contract')}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">
                            <SankeyMetricButton
                              value={line.totalMatched}
                              className="text-blue-700"
                              onClick={() => openSlotMetric(line.row.timeLabel, 'total')}
                            />
                          </td>`,
  'quarter storage'
);

if (!src.includes('<SankeyDetailDialog')) {
  src = src.replace(
    `      {saveToast ? (`,
    `      <SankeyDetailDialog focus={detailFocus} onClose={() => setDetailFocus(null)} />
      {saveToast ? (`
  );
}

// Write UTF-8 without BOM (standard for TS source)
fs.writeFileSync(pagePath, src, { encoding: 'utf8' });
console.log('Wrote', pagePath);

// Verify
const verify = fs.readFileSync(pagePath, 'utf8');
const qCount = (verify.match(/\?\?/g) || []).length;
console.log('Verify: 預結算=', verify.includes('預結算'), '一月=', verify.includes('一月'), '?? count=', qCount);
if (!verify.includes('預結算') || qCount > 20) {
  throw new Error('Repair verification failed');
}

// --- 3. Regenerate CSV with BOM ---
execSync('node scripts/export-sankey-detail-csv.mjs', { cwd: root, stdio: 'inherit' });
console.log('CSV regenerated');
