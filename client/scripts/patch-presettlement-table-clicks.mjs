import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(__dirname, '../src/components/SettlementPreSettlementPage.tsx');
let src = fs.readFileSync(file, 'utf8');

function rep(from, to) {
  const a = from.replace(/\n/g, '\r\n');
  const b = to.replace(/\n/g, '\r\n');
  if (src.includes(from)) src = src.replace(from, to);
  else if (src.includes(a)) src = src.replace(a, b);
  else {
    console.error('MISSING:', from.slice(0, 100));
    process.exit(1);
  }
}

if (!src.includes('openSlotMetric')) {
  console.error('openSlotMetric not found - run main patch first');
  process.exit(1);
}

rep(
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

rep(
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

rep(
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

rep(
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

rep(
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
                          </td>`
);

fs.writeFileSync(file, src, 'utf8');
console.log('table cells patched');
