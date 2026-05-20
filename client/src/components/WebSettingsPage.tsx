import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useUiFont } from '@/contexts/UiFontContext';
import { UI_FONT_KEYS, UI_FONT_META, UI_FONT_MIN_PX } from '@/lib/uiFontScale';

export default function WebSettingsPage() {
  const { scale, setFontSize, resetAll } = useUiFont();

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-10">
      <header>
        <h2 className="text-2xl font-bold tracking-tight text-slate-800">7.4 設定網頁</h2>
        <p className="mt-1 text-sm text-slate-600">
          調整全站字級變數（CSS <code className="rounded bg-slate-100 px-1">--ui-font-*</code>
          ）。變更會即時套用並儲存於本機瀏覽器。
        </p>
      </header>

      <Card className="border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">字體大小</CardTitle>
          <CardDescription className="text-sm">
            全站共 <strong>{UI_FONT_KEYS.length}</strong> 種字級；小於 {UI_FONT_MIN_PX}px 的項目預設皆為{' '}
            <strong>{UI_FONT_MIN_PX}px</strong>。下方數值對應各頁面使用的 Tailwind class 與圖表字級。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-700">
                <tr>
                  <th className="px-3 py-2">分類</th>
                  <th className="px-3 py-2">變數</th>
                  <th className="px-3 py-2">對應 class</th>
                  <th className="px-3 py-2">用途</th>
                  <th className="px-3 py-2 text-right">大小 (px)</th>
                  <th className="px-3 py-2 w-40">預覽</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {UI_FONT_KEYS.map((key) => {
                  const meta = UI_FONT_META[key];
                  const px = scale[key];
                  return (
                    <tr key={key}>
                      <td className="px-3 py-2 font-semibold">{meta.label}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-600">--ui-font-{key}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{meta.tailwind ?? '—'}</td>
                      <td className="max-w-[200px] px-3 py-2 text-xs text-slate-600">{meta.usage}</td>
                      <td className="px-3 py-2 text-right">
                        <Input
                          type="number"
                          min={UI_FONT_MIN_PX}
                          max={48}
                          step={0.5}
                          value={px}
                          onChange={(e) => setFontSize(key, Number(e.target.value))}
                          className="ml-auto h-8 w-20 text-right tabular-nums"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <span style={{ fontSize: `${px}px` }} className="font-semibold text-slate-900">
                          預覽文字 Aa
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={resetAll}>
              還原預設值
            </Button>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <p className="font-bold">分類摘要</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              <li>
                <strong>15px（原 10～14 級）</strong>：圖表軸、圖例、標籤、表格、按鈕、內文（text-ui-10/11、text-xs、text-sm）
              </li>
              <li>
                <strong>16～20px</strong>：表單、區塊與對話框標題
              </li>
              <li>
                <strong>24～36px</strong>：各作業頁主標與 KPI 大數字
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
