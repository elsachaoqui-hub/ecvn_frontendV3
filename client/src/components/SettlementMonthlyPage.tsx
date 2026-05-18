import { useMemo, useState } from 'react';

import SettlementEnergyFlowSankey, {
  type EnergyFlowAggregate,
} from '@/components/SettlementEnergyFlowSankey';

/** 5.2 月結算：能源流動桑基已整合至 4.1 預結算，此頁保留獨立入口並以年度示範資料呈現 */
export default function SettlementMonthlyPage() {
  const [year, setYear] = useState(() => new Date().getFullYear());

  const aggregate = useMemo((): EnergyFlowAggregate => {
    const k = year === new Date().getFullYear() ? 0.85 : 1.15;
    return {
      generation: Number((4200 * k).toFixed(1)),
      load: Number((3800 * k).toFixed(1)),
      storageIn: Number((980 * k).toFixed(1)),
      storageOut: Number((720 * k).toFixed(1)),
      contractMatched: Number((1320 * k).toFixed(1)),
      totalMatched: Number((1980 * k).toFixed(1)),
      dayCount: 30,
      periodLabel: `${year} 年（示範）`,
    };
  }, [year]);

  return (
    <div className="space-y-6 pb-8 text-slate-800">
      <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900">5.2 月結算</h2>
        <p className="mt-2 text-sm font-semibold text-slate-600">
          能源流動總覽（桑基）已整合至「4.1 預結算」頁面，並與明細表下鑽（年 → 月 → 日）連動。此處提供年度層級快速檢視。
        </p>
        <div className="mt-4 flex items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-slate-600">示範年度</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="h-9 rounded-md border border-slate-300 bg-white px-2 text-xs font-bold text-slate-800"
            >
              {[2024, 2025, 2026].map((y) => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>
      <SettlementEnergyFlowSankey drill="year" aggregate={aggregate} />
    </div>
  );
}
