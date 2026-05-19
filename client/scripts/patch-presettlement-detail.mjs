import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../src/components/SettlementPreSettlementPage.tsx');
let src = fs.readFileSync(file, 'utf8');

const replacements = [
  [
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
import { loadSankeyExplorerDataset } from '@/lib/sankeyExplorerCsv';`,
  ],
  [
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
  ],
  [
    `  const sankeyDetailRows = useMemo(() => {
    const totalDays = 25;
    const baseDate = new Date();
    baseDate.setHours(12, 0, 0, 0);

    // 先由舊到新計算，讓儲能存入可以累積到隔天餘額
    const ascRows: Array<{
      dateLabel: string;
      generation: number;
      load: number;
      storageIn: number;
      storageBalance: number;
      storageOut: number;
      contractMatched: number;
      totalMatched: number;
    }> = [];

    let carryBalance = 6;
    const dayRefs = Array.from({ length: totalDays }, (_, idx) => {
      const ref = new Date(baseDate);
      ref.setDate(baseDate.getDate() - (totalDays - 1 - idx));
      return ref;
    });

    dayRefs.forEach((ref) => {
      const dateLabel = ref.toISOString().slice(0, 10);
      const dayRows = buildHourlyRowsByDate(dateLabel);
      const generation = Number(dayRows.reduce((sum, row) => sum + row.generationActual, 0).toFixed(1));
      const load = Number(dayRows.reduce((sum, row) => sum + row.loadActual, 0).toFixed(1));

      // 發電端超過用電端時，優先提高儲能存入
      const surplus = Math.max(generation - load, 0);
      const storageIn = Number((surplus * 0.62).toFixed(1));

      // 當日可動用餘額 = 前日結餘 + 今日存入
      const availableBalance = Number((carryBalance + storageIn).toFixed(1));

      // 提領量受當日餘額上限限制
      const deficit = Math.max(load - generation, 0);
      const desiredOut = deficit * 0.5;
      const storageOut = Number(Math.min(availableBalance, desiredOut).toFixed(1));

      const endBalance = Number((availableBalance - storageOut).toFixed(1));
      carryBalance = endBalance;

      const contractMatched = Number(Math.min(generation, load * 0.35).toFixed(1));
      const totalMatched = Number((storageOut + contractMatched).toFixed(1));

      ascRows.push({
        dateLabel,
        generation,
        load,
        storageIn,
        storageBalance: endBalance,
        storageOut,
        contractMatched,
        totalMatched,
      });
    });

    // UI 維持由新到舊顯示
    return ascRows.reverse();
  }, []);`,
    `  const sankeyExplorerDataset = useMemo(() => loadSankeyExplorerDataset(), []);
  const sankeyDetailRows = sankeyExplorerDataset.dailyRows;`,
  ],
  [
    `  const explorerQuarterRows = useMemo(() => {
    if (!sankeyExplorerDay) return [];
    const hourly = buildHourlyRowsByDate(sankeyExplorerDay);
    return expandHourlyToQuarterRows(hourly, sankeyExplorerDay);
  }, [sankeyExplorerDay]);`,
    `  const explorerQuarterRows = useMemo(() => {
    if (!sankeyExplorerDay) return [];
    return sankeyExplorerDataset.quarterRowsByDate.get(sankeyExplorerDay) ?? [];
  }, [sankeyExplorerDay, sankeyExplorerDataset]);`,
  ],
  [
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
  ],
  [
    `          <SettlementEnergyFlowSankey drill={energyFlowDrill} aggregate={energyFlowAggregate} embedded />`,
    `          <SettlementEnergyFlowSankey
            drill={energyFlowDrill}
            aggregate={energyFlowAggregate}
            embedded
            onSankeyInteraction={handleSankeyInteraction}
          />`,
  ],
  [
    `            分鐘可編輯量測值並填寫原因；異常以紅色標示，廠商確認後改為綠色。`,
    `            分鐘可編輯量測值並填寫原因；異常以紅色標示，廠商確認後改為綠色。表格數值與上方桑基圖節點／連線可點擊，開啟 G1～G5、L1～L5 與流向組成明細。`,
  ],
];

for (const [from, to] of replacements) {
  const normalizedFrom = from.replace(/\n/g, '\r\n');
  const normalizedTo = to.replace(/\n/g, '\r\n');
  if (src.includes(from)) {
    src = src.replace(from, to);
  } else if (src.includes(normalizedFrom)) {
    src = src.replace(normalizedFrom, normalizedTo);
  } else {
    console.error('MISSING BLOCK:', from.slice(0, 80));
    process.exit(1);
  }
}

// Year table metric cells
src = src.replace(
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
                        </td>`
);

src = src.replace(
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
                        </td>`
);

// Daily table metric cells
src = src.replace(
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
                          </td>`
);

// Quarter table - generation and load cells
src = src.replace(
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
                          </td>`
);

src = src.replace(
  `                          <td className="px-3 py-2 text-right tabular-nums font-semibold">{line.runBalance.toFixed(3)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-blue-700">{line.contractMatched.toFixed(3)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-blue-700">{line.totalMatched.toFixed(3)}</td>`,
  `                          <td className="px-3 py-2 text-right font-semibold">
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
                          </td>`
);

// Add dialog before save toast
if (!src.includes('SankeyDetailDialog')) {
  console.error('SankeyDetailDialog import missing');
  process.exit(1);
}

if (!src.includes('<SankeyDetailDialog')) {
  src = src.replace(
    `      {saveToast ? (`,
    `      <SankeyDetailDialog focus={detailFocus} onClose={() => setDetailFocus(null)} />
      {saveToast ? (`
  );
}

fs.writeFileSync(file, src, 'utf8');
console.log('patched', file);
