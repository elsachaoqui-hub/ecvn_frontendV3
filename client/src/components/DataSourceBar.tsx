type DataSourceBarProps = {
  onApplyFullRange?: () => void;
  className?: string;
};

/** 檢核／結算頁共用的資料來源標籤與「帶入資料全日區間」按鈕 */
export default function DataSourceBar({ onApplyFullRange, className = '' }: DataSourceBarProps) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2 ${className}`.trim()}
    >
      {onApplyFullRange ? (
        <button
          type="button"
          onClick={onApplyFullRange}
          className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-100"
        >
          帶入資料全日區間
        </button>
      ) : null}
      <span className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
        資料來源：AMI(量測)
      </span>
      <span className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-bold text-indigo-700">
        資料來源：M表(量測)
      </span>
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
        資料來源：計畫量
      </span>
    </div>
  );
}
