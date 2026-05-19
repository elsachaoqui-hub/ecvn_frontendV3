/**
 * 匯出桑基明細表示範資料到 CSV（與原網頁內建公式一致，便於在試算表校對後覆寫）。
 * 執行：node client/scripts/export-sankey-explorer-csv.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, 'src/data');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function buildHourlyRowsByDate(dateLabel) {
  const seed = dateLabel.split('-').reduce((acc, part) => acc + Number(part || 0), 0);
  return Array.from({ length: 24 }, (_, hour) => {
    const dayOffset = ((seed + hour * 13) % 11) - 5;
    const baseGen = hour >= 6 && hour <= 17 ? 55 + Math.sin(((hour - 6) / 11) * Math.PI) * 95 : 18;
    const generationPlan = Number(baseGen.toFixed(1));
    const generationActual = Number(
      (generationPlan * (0.93 + ((hour % 5) - 2) * 0.018 + dayOffset * 0.003)).toFixed(1)
    );
    const baseLoad = 72 + Math.cos(((hour - 13) / 11) * Math.PI) * 26 + (hour >= 18 && hour <= 22 ? 24 : 0);
    const loadPlan = Number(baseLoad.toFixed(1));
    const loadActual = Number(
      (loadPlan * (0.95 + ((hour % 4) - 1) * 0.02 - dayOffset * 0.0025)).toFixed(1)
    );
    const storagePlan = Number(
      (hour >= 11 && hour <= 14
        ? 20 + (hour - 11) * 4
        : hour >= 18 && hour <= 20
          ? -28 + (hour - 18) * 2
          : 0
      ).toFixed(1)
    );
    const storageActual = Number(
      (storagePlan * (0.88 + ((hour % 3) - 1) * 0.06 + dayOffset * 0.002)).toFixed(1)
    );
    return { hour, generationPlan, generationActual, loadPlan, loadActual, storagePlan, storageActual };
  });
}

function expandHourlyToQuarterRows(rows, dateLabel) {
  const dateSeed = dateLabel.split('-').reduce((acc, part) => acc + Number(part || 0), 0);
  const out = [];
  for (const row of rows) {
    const h = row.hour;
    const w0 = 0.23 + ((dateSeed + h * 7) % 8) * 0.01;
    const w1 = 0.27 - ((dateSeed + h * 3) % 5) * 0.008;
    const w2 = 0.26 + ((dateSeed + h) % 4) * 0.01;
    const w3 = Math.max(0.05, 1 - w0 - w1 - w2);
    const sumW = w0 + w1 + w2 + w3;
    const weights = [w0 / sumW, w1 / sumW, w2 / sumW, w3 / sumW];
    const splitHourTotal = (total) => {
      const raw = weights.map((w) => Number((total * w).toFixed(3)));
      const drift = Number((total - raw.reduce((a, b) => a + b, 0)).toFixed(3));
      raw[3] = Number((raw[3] + drift).toFixed(3));
      return raw;
    };
    const genP = splitHourTotal(row.generationPlan);
    const genA = splitHourTotal(row.generationActual);
    const loadP = splitHourTotal(row.loadPlan);
    const loadA = splitHourTotal(row.loadActual);
    const stoP = splitHourTotal(row.storagePlan);
    const stoA = splitHourTotal(row.storageActual);
    for (let q = 0; q < 4; q++) {
      const mins = q * 15;
      out.push({
        date: dateLabel,
        time_slot: `${pad2(h)}:${pad2(mins)}`,
        slot_index: h * 4 + q,
        generation_plan_kwh: genP[q],
        generation_actual_kwh: genA[q],
        load_plan_kwh: loadP[q],
        load_actual_kwh: loadA[q],
        storage_plan_kwh: stoP[q],
        storage_actual_kwh: stoA[q],
      });
    }
  }
  return out;
}

function buildDailyRows() {
  const totalDays = 25;
  const baseDate = new Date();
  baseDate.setHours(12, 0, 0, 0);
  const ascRows = [];
  let carryBalance = 6;
  const dayRefs = Array.from({ length: totalDays }, (_, idx) => {
    const ref = new Date(baseDate);
    ref.setDate(baseDate.getDate() - (totalDays - 1 - idx));
    return ref;
  });
  for (const ref of dayRefs) {
    const dateLabel = ref.toISOString().slice(0, 10);
    const dayRows = buildHourlyRowsByDate(dateLabel);
    const generation = Number(dayRows.reduce((s, r) => s + r.generationActual, 0).toFixed(1));
    const load = Number(dayRows.reduce((s, r) => s + r.loadActual, 0).toFixed(1));
    const surplus = Math.max(generation - load, 0);
    const storageIn = Number((surplus * 0.62).toFixed(1));
    const availableBalance = Number((carryBalance + storageIn).toFixed(1));
    const deficit = Math.max(load - generation, 0);
    const storageOut = Number(Math.min(availableBalance, deficit * 0.5).toFixed(1));
    const endBalance = Number((availableBalance - storageOut).toFixed(1));
    carryBalance = endBalance;
    const contractMatched = Number(Math.min(generation, load * 0.35).toFixed(1));
    const totalMatched = Number((storageOut + contractMatched).toFixed(1));
    ascRows.push({
      date: dateLabel,
      generation_kwh: generation,
      load_kwh: load,
      storage_in_kwh: storageIn,
      storage_out_kwh: storageOut,
      storage_balance_kwh: endBalance,
      contract_matched_kwh: contractMatched,
      total_matched_kwh: totalMatched,
    });
  }
  return ascRows.reverse();
}

function toCsv(headers, rows) {
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => row[h]).join(','));
  }
  return lines.join('\n') + '\n';
}

const daily = buildDailyRows();
const slotHeaders = [
  'date',
  'time_slot',
  'slot_index',
  'generation_plan_kwh',
  'generation_actual_kwh',
  'load_plan_kwh',
  'load_actual_kwh',
  'storage_plan_kwh',
  'storage_actual_kwh',
];
const slots = daily
  .slice()
  .reverse()
  .flatMap((d) => expandHourlyToQuarterRows(buildHourlyRowsByDate(d.date), d.date));

fs.mkdirSync(dataDir, { recursive: true });
fs.writeFileSync(
  path.join(dataDir, 'sankey_explorer_daily.csv'),
  toCsv(
    [
      'date',
      'generation_kwh',
      'load_kwh',
      'storage_in_kwh',
      'storage_out_kwh',
      'storage_balance_kwh',
      'contract_matched_kwh',
      'total_matched_kwh',
    ],
    daily
  ),
  'utf8'
);
fs.writeFileSync(path.join(dataDir, 'sankey_explorer_15min.csv'), toCsv(slotHeaders, slots), 'utf8');

console.log(`daily rows: ${daily.length}, 15min rows: ${slots.length}`);
console.log(`written to ${dataDir}`);
