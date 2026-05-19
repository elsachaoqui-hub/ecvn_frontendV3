import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../src/components/SettlementPreSettlementPage.tsx');
let s = fs.readFileSync(filePath, 'utf8');

if (!s.includes('scrollIntoView')) {
  console.error('Already patched or unexpected file state');
  process.exit(1);
}

s = s.replace(
  "import { useEffect, useMemo, useRef, useState } from 'react';",
  "import { useCallback, useEffect, useMemo, useRef, useState } from 'react';"
);

if (!s.includes("from '@/lib/utils'")) {
  s = s.replace(
    "} from '@/components/SettlementEnergyFlowSankey';\n\ntype HourRow",
    "} from '@/components/SettlementEnergyFlowSankey';\nimport { cn } from '@/lib/utils';\n\ntype HourRow"
  );
}

s = s.replace(
  `  const sankeyExplorerScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sankeyExplorerScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    if (sankeyExplorerView === 'quarter' && sankeyExplorerDay) {
      requestAnimationFrame(() => {
        document.getElementById('sankey-explorer-table')?.scrollIntoView({ block: 'start', behavior: 'auto' });
      });
    }
  }, [sankeyExplorerView, sankeyExplorerDay, sankeyExplorerMonth, sankeyExplorerYear]);
  const [selectedSankeyDate, setSelectedSankeyDate] = useState(() => new Date().toISOString().slice(0, 10));`,
  `  const sankeyExplorerScrollRef = useRef<HTMLDivElement>(null);
  const [quarterScrollPos, setQuarterScrollPos] = useState({
    timeLabel: '00:00',
    index: 1,
    total: 96,
    percent: 0,
  });
  const [selectedSankeyDate, setSelectedSankeyDate] = useState(() => new Date().toISOString().slice(0, 10));`
);

s = s.replace(
  `  const [reAnnualTargetPct, setReAnnualTargetPct] = useState(90);
  const [reCumStart, setReCumStart] = useState('');`,
  `  const updateQuarterScrollPos = useCallback(() => {
    const el = sankeyExplorerScrollRef.current;
    if (!el || sankeyExplorerView !== 'quarter') return;
    const rows = el.querySelectorAll<HTMLElement>('[data-quarter-row]');
    const total = rows.length || 96;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const percent = maxScroll > 0 ? Math.round((el.scrollTop / maxScroll) * 100) : 0;
    let index = 1;
    let timeLabel = rows[0]?.dataset.quarterRow ?? '00:00';
    const anchor = el.scrollTop + 36;
    rows.forEach((row, i) => {
      if (row.offsetTop <= anchor) {
        index = i + 1;
        timeLabel = row.dataset.quarterRow ?? timeLabel;
      }
    });
    setQuarterScrollPos({ timeLabel, index, total, percent });
  }, [sankeyExplorerView]);

  useEffect(() => {
    const el = sankeyExplorerScrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    if (sankeyExplorerView === 'quarter') {
      requestAnimationFrame(updateQuarterScrollPos);
    }
  }, [sankeyExplorerView, sankeyExplorerDay, sankeyExplorerMonth, sankeyExplorerYear, updateQuarterScrollPos]);

  useEffect(() => {
    const el = sankeyExplorerScrollRef.current;
    if (!el || sankeyExplorerView !== 'quarter') return;
    const onScroll = () => updateQuarterScrollPos();
    el.addEventListener('scroll', onScroll, { passive: true });
    updateQuarterScrollPos();
    return () => el.removeEventListener('scroll', onScroll);
  }, [sankeyExplorerView, sankeyExplorerDay, updateQuarterScrollPos, explorerQuarterDisplayResolved.length]);

  const [reAnnualTargetPct, setReAnnualTargetPct] = useState(90);
  const [reCumStart, setReCumStart] = useState('');`
);

const locationBar = `            {sankeyExplorerView === 'quarter' && sankeyExplorerDay ? (
              <motion.div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-blue-200 bg-blue-50 px-3 py-2 text-xs">
                <span className="font-bold text-blue-900">
                  預結算 ＞ 桑基明細 ＞ <span className="text-indigo-700">15 分鐘 · {sankeyExplorerDay}</span>
                </span>
                <span className="font-semibold text-slate-700">
                  目前：{quarterScrollPos.timeLabel}（第 {quarterScrollPos.index}/{quarterScrollPos.total} 筆）
                </span>
                <motion.div className="flex items-center gap-2">
                  <motion.div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
                    <motion.div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-150"
                      style={{ width: \`\${quarterScrollPos.percent}%\` }}
                    />
                  </motion.div>
                  <span className="tabular-nums text-slate-600">{quarterScrollPos.percent}%</span>
                </motion.div>
              </motion.div>
            ) : null}
`;

// Fix: use div not motion.div in locationBar
const locationBarFixed = locationBar.replaceAll('motion.div', 'motion.div').replaceAll('motion.div', 'div');
// Actually I made a mistake - let me fix the script content

fs.writeFileSync(filePath, s, 'utf8');
console.log('partial - need fix');
