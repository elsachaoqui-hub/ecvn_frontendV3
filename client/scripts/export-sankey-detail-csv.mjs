/**
 * 產生桑基詳細 CSV：電號 G1-G5 / L1-L5、15 分鐘主表、流向明細、日彙總。
 * node client/scripts/export-sankey-detail-csv.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/data');
const TOTAL_DAYS = 14;
const SLOT_HOURS = 0.25;
const GEN_IDS = ['G1', 'G2', 'G3', 'G4', 'G5'];
const LOAD_IDS = ['L1', 'L2', 'L3', 'L4', 'L5'];
const GEN_WEIGHTS = [0.3, 0.22, 0.18, 0.16, 0.14];
const LOAD_WEIGHTS = [0.28, 0.24, 0.2, 0.16, 0.12];

const ASSETS = [
  { asset_id: 'G1', asset_type: 'generation', resource_type: '太陽能', site_name: '甲案 PV-A', meter_number: 'M301122334', capacity_kw: 520 },
  { asset_id: 'G2', asset_type: 'generation', resource_type: '太陽能', site_name: '乙案 PV-B', meter_number: 'M301122335', capacity_kw: 480 },
  { asset_id: 'G3', asset_type: 'generation', resource_type: '風力', site_name: '離岸風場 A', meter_number: 'M301122336', capacity_kw: 600 },
  { asset_id: 'G4', asset_type: 'generation', resource_type: '水力', site_name: '小水力 C', meter_number: 'M301122337', capacity_kw: 350 },
  { asset_id: 'G5', asset_type: 'generation', resource_type: '生質能', site_name: '生質機組 D', meter_number: 'M301122338', capacity_kw: 280 },
  { asset_id: 'L1', asset_type: 'load', resource_type: '工業負載', site_name: '科學園區 A', meter_number: 'M301122339', capacity_kw: 900 },
  { asset_id: 'L2', asset_type: 'load', resource_type: '工業負載', site_name: '加工區 B', meter_number: 'M301122340', capacity_kw: 750 },
  { asset_id: 'L3', asset_type: 'load', resource_type: '商業負載', site_name: '商辦 C', meter_number: 'M301122341', capacity_kw: 620 },
  { asset_id: 'L4', asset_type: 'load', resource_type: '公共負載', site_name: '校園 D', meter_number: 'M301122342', capacity_kw: 480 },
  { asset_id: 'L5', asset_type: 'load', resource_type: '住宅負載', site_name: '社區 E', meter_number: 'M301122343', capacity_kw: 400 },
];

function pad2(n) {
  return String(n).padStart(2, '0');
}

function round3(n) {
  return Number(n.toFixed(3));
}

function splitByWeights(total, weights) {
  const raw = weights.map((w) => round3(total * w));
  const drift = round3(total - raw.reduce((a, b) => a + b, 0));
  raw[raw.length - 1] = round3(raw[raw.length - 1] + drift);
  return raw;
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
    return { hour, generationActual, loadActual, storageActual };
  });
}

function expandToQuarterSlots(dateLabel) {
  const hourly = buildHourlyRowsByDate(dateLabel);
  const dateSeed = dateLabel.split('-').reduce((acc, part) => acc + Number(part || 0), 0);
  const slots = [];
  for (const row of hourly) {
    const h = row.hour;
    const w0 = 0.23 + ((dateSeed + h * 7) % 8) * 0.01;
    const w1 = 0.27 - ((dateSeed + h * 3) % 5) * 0.008;
    const w2 = 0.26 + ((dateSeed + h) % 4) * 0.01;
    const w3 = Math.max(0.05, 1 - w0 - w1 - w2);
    const sumW = w0 + w1 + w2 + w3;
    const weights = [w0 / sumW, w1 / sumW, w2 / sumW, w3 / sumW];
    const split = (total) => {
      const raw = weights.map((w) => round3(total * w));
      const drift = round3(total - raw.reduce((a, b) => a + b, 0));
      raw[3] = round3(raw[3] + drift);
      return raw;
    };
    const genParts = split(row.generationActual);
    const loadParts = split(row.loadActual);
    const stoParts = split(row.storageActual);
    for (let q = 0; q < 4; q++) {
      slots.push({
        date: dateLabel,
        time_slot: `${pad2(h)}:${pad2(q * 15)}`,
        slot_index: h * 4 + q,
        generation_kwh: genParts[q],
        load_kwh: loadParts[q],
        storage_actual_kwh: stoParts[q],
      });
    }
  }
  return slots;
}

function computeSankeyFlows(slot, prevBalance) {
  const gen = slot.generation_total_kwh;
  const load = slot.load_total_kwh;
  const storageActual = slot.storage_actual_kwh;
  const charge = round3(Math.max(storageActual, 0));
  const endBalance = round3(prevBalance + storageActual);

  // 發電端：8 成合約、1 成儲能、1 成餘電
  const genToContract = round3(gen * 0.8);
  const genToStorage = round3(gen * 0.1);
  const genToSurplus = round3(Math.max(gen - genToContract - genToStorage, 0));
  const balanceToStorage = round3(Math.max(charge * 0.5, 0));

  // 合約全數先入用電端；成功匹配＝合約量＋儲能直送用電端；其餘用電區分為餘電與未匹配量
  const contractToLoad = genToContract;
  const contractToSurplus = 0;
  const contractMatched = genToContract;
  const contractTransfer = round3(contractMatched * 0.98);

  // 儲能節點：流入＝流出（→用電端＋→儲能存入量）
  const storageToDeposit = round3(charge);
  const storageInToNode = round3(genToStorage + balanceToStorage);
  const storageToLoad = round3(Math.max(0, storageInToNode - storageToDeposit));

  const dischargeForFields = round3(storageToLoad);
  const loadToSuccess = round3(contractToLoad + storageToLoad);
  const remainderAfterSuccess = round3(Math.max(load - loadToSuccess, 0));
  const surplusShareCeil = round3(contractToLoad * 0.1);
  const loadToSurplus = round3(Math.min(surplusShareCeil, remainderAfterSuccess));
  const loadToUnmatched = round3(Math.max(remainderAfterSuccess - loadToSurplus, 0));

  const transferSuccess = loadToSuccess;
  const surplus = round3(genToSurplus + contractToSurplus + loadToSurplus);

  return {
    contract_transfer_kwh: contractTransfer,
    contract_matched_kwh: contractMatched,
    storage_plan_kwh: storageActual,
    storage_actual_kwh: storageActual,
    storage_charge_kwh: charge,
    storage_discharge_kwh: dischargeForFields,
    prev_storage_balance_kwh: round3(prevBalance),
    end_storage_balance_kwh: endBalance,
    transfer_success_kwh: transferSuccess,
    surplus_kwh: surplus,
    node_發電端_kwh: gen,
    node_儲能餘額_kwh: round3(prevBalance),
    node_合約數量_kwh: genToContract,
    node_儲能_kwh: round3(genToStorage + balanceToStorage),
    node_用電端_kwh: load,
    node_用電端轉移量_kwh: storageToLoad,
    node_成功匹配量_kwh: loadToSuccess,
    node_儲能存入量_kwh: storageToDeposit,
    node_未匹配量_kwh: loadToUnmatched,
    node_餘電_kwh: round3(genToSurplus + contractToSurplus + loadToSurplus),
    links: [
      { source: '發電端', target: '合約數量', kwh: genToContract, type: 'generation_contract' },
      { source: '發電端', target: '儲能', kwh: genToStorage, type: 'generation_storage' },
      { source: '發電端', target: '餘電', kwh: genToSurplus, type: 'generation_surplus' },
      { source: '儲能餘額', target: '儲能', kwh: balanceToStorage, type: 'balance_storage' },
      { source: '合約數量', target: '用電端', kwh: contractToLoad, type: 'contract_load' },
      { source: '合約數量', target: '餘電', kwh: contractToSurplus, type: 'contract_surplus' },
      { source: '儲能', target: '用電端', kwh: storageToLoad, type: 'storage_to_load' },
      { source: '儲能', target: '儲能存入量', kwh: storageToDeposit, type: 'storage_deposit' },
      { source: '用電端', target: '成功匹配量', kwh: loadToSuccess, type: 'load_success' },
      { source: '用電端', target: '餘電', kwh: loadToSurplus, type: 'load_surplus' },
      { source: '用電端', target: '未匹配量', kwh: loadToUnmatched, type: 'load_unmatched' },
    ],
  };
}

function allocateAssetFlows(link, genKwhParts, loadKwhParts) {
  const rows = [];
  const { source, target, kwh, type } = link;
  if (kwh <= 0.001) return rows;

  if (source === '發電端') {
    const parts = splitByWeights(kwh, GEN_WEIGHTS);
    parts.forEach((flow, i) => {
      if (flow <= 0) return;
      rows.push({
        source_node: source,
        source_asset_id: GEN_IDS[i],
        target_node: target,
        target_asset_id: '',
        flow_kwh: flow,
        flow_type: type,
        notes: `${GEN_IDS[i]} ${genKwhParts[i]}kWh 時段占比`,
      });
    });
    return rows;
  }

  if (target === '用電端' || target === '成功匹配量' || target === '未匹配量') {
    const parts = splitByWeights(kwh, LOAD_WEIGHTS);
    parts.forEach((flow, i) => {
      if (flow <= 0) return;
      rows.push({
        source_node: source,
        source_asset_id: '',
        target_node: target,
        target_asset_id: LOAD_IDS[i],
        flow_kwh: flow,
        flow_type: type,
        notes: `${LOAD_IDS[i]} 負載 ${loadKwhParts[i]}kWh 時段占比`,
      });
    });
    return rows;
  }

  rows.push({
    source_node: source,
    source_asset_id: '',
    target_node: target,
    target_asset_id: '',
    flow_kwh: kwh,
    flow_type: type,
    notes: '節點彙總流量',
  });
  return rows;
}

function toCsv(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n') + '\n';
}

/** UTF-8 BOM：Excel 在 Windows 上才能正確顯示中文 */
function writeCsvUtf8Bom(filePath, content) {
  fs.writeFileSync(filePath, '\uFEFF' + content, 'utf8');
}

function buildDataset() {
  const baseDate = new Date();
  baseDate.setHours(12, 0, 0, 0);
  const dates = Array.from({ length: TOTAL_DAYS }, (_, idx) => {
    const ref = new Date(baseDate);
    ref.setDate(baseDate.getDate() - (TOTAL_DAYS - 1 - idx));
    return ref.toISOString().slice(0, 10);
  });

  const slotRows = [];
  const flowRows = [];
  let flowSeq = 0;

  for (const date of dates) {
    const rawSlots = expandToQuarterSlots(date);
    let prevBalance = 6;

    for (const raw of rawSlots) {
      const genParts = splitByWeights(raw.generation_kwh, GEN_WEIGHTS);
      const loadParts = splitByWeights(raw.load_kwh, LOAD_WEIGHTS);
      const genKw = genParts.map((kwh) => round3(kwh / SLOT_HOURS));
      const loadKw = loadParts.map((kwh) => round3(kwh / SLOT_HOURS));

      const slot = {
        date: raw.date,
        time_slot: raw.time_slot,
        slot_index: raw.slot_index,
        G1_kw: genKw[0],
        G2_kw: genKw[1],
        G3_kw: genKw[2],
        G4_kw: genKw[3],
        G5_kw: genKw[4],
        G1_kwh: genParts[0],
        G2_kwh: genParts[1],
        G3_kwh: genParts[2],
        G4_kwh: genParts[3],
        G5_kwh: genParts[4],
        L1_kw: loadKw[0],
        L2_kw: loadKw[1],
        L3_kw: loadKw[2],
        L4_kw: loadKw[3],
        L5_kw: loadKw[4],
        L1_kwh: loadParts[0],
        L2_kwh: loadParts[1],
        L3_kwh: loadParts[2],
        L4_kwh: loadParts[3],
        L5_kwh: loadParts[4],
        generation_total_kwh: raw.generation_kwh,
        load_total_kwh: raw.load_kwh,
        storage_actual_kwh: raw.storage_actual_kwh,
      };

      const sankey = computeSankeyFlows(slot, prevBalance);
      prevBalance = sankey.end_storage_balance_kwh;
      const { links, ...sankeyFields } = sankey;
      Object.assign(slot, sankeyFields);

      slotRows.push(slot);

      for (const link of links) {
        const allocated = allocateAssetFlows(link, genParts, loadParts);
        for (const a of allocated) {
          flowSeq += 1;
          flowRows.push({
            date: raw.date,
            time_slot: raw.time_slot,
            flow_id: `F${raw.date.replace(/-/g, '')}${raw.time_slot.replace(':', '')}${String(flowSeq).padStart(4, '0')}`,
            ...a,
          });
        }
      }
    }
  }

  const dailyMap = new Map();
  for (const s of slotRows) {
    const d = dailyMap.get(s.date) ?? {
      date: s.date,
      generation_kwh: 0,
      load_kwh: 0,
      storage_in_kwh: 0,
      storage_out_kwh: 0,
      storage_balance_kwh: 0,
      contract_matched_kwh: 0,
      total_matched_kwh: 0,
    };
    d.generation_kwh = round3(d.generation_kwh + s.generation_total_kwh);
    d.load_kwh = round3(d.load_kwh + s.load_total_kwh);
    d.storage_in_kwh = round3(d.storage_in_kwh + s.storage_charge_kwh);
    d.storage_out_kwh = round3(d.storage_out_kwh + s.storage_discharge_kwh);
    d.contract_matched_kwh = round3(d.contract_matched_kwh + s.contract_matched_kwh);
    d.total_matched_kwh = round3(d.total_matched_kwh + s.transfer_success_kwh);
    d.storage_balance_kwh = s.end_storage_balance_kwh;
    dailyMap.set(s.date, d);
  }
  const dailyRows = [...dailyMap.values()].sort((a, b) => b.date.localeCompare(a.date));

  return { slotRows, flowRows, dailyRows };
}

const { slotRows, flowRows, dailyRows } = buildDataset();

const slotHeaders = [
  'date',
  'time_slot',
  'slot_index',
  'G1_kw',
  'G2_kw',
  'G3_kw',
  'G4_kw',
  'G5_kw',
  'G1_kwh',
  'G2_kwh',
  'G3_kwh',
  'G4_kwh',
  'G5_kwh',
  'generation_total_kwh',
  'L1_kw',
  'L2_kw',
  'L3_kw',
  'L4_kw',
  'L5_kw',
  'L1_kwh',
  'L2_kwh',
  'L3_kwh',
  'L4_kwh',
  'L5_kwh',
  'load_total_kwh',
  'contract_transfer_kwh',
  'contract_matched_kwh',
  'storage_plan_kwh',
  'storage_actual_kwh',
  'storage_charge_kwh',
  'storage_discharge_kwh',
  'prev_storage_balance_kwh',
  'end_storage_balance_kwh',
  'transfer_success_kwh',
  'surplus_kwh',
  'node_發電端_kwh',
  'node_儲能餘額_kwh',
  'node_合約數量_kwh',
  'node_儲能_kwh',
  'node_用電端_kwh',
  'node_用電端轉移量_kwh',
  'node_成功匹配量_kwh',
  'node_儲能存入量_kwh',
  'node_未匹配量_kwh',
  'node_餘電_kwh',
];

const flowHeaders = [
  'date',
  'time_slot',
  'flow_id',
  'source_node',
  'source_asset_id',
  'target_node',
  'target_asset_id',
  'flow_kwh',
  'flow_type',
  'notes',
];

fs.mkdirSync(dataDir, { recursive: true });
writeCsvUtf8Bom(
  path.join(dataDir, 'sankey_asset_registry.csv'),
  toCsv(['asset_id', 'asset_type', 'resource_type', 'site_name', 'meter_number', 'capacity_kw'], ASSETS)
);
writeCsvUtf8Bom(path.join(dataDir, 'sankey_slots_15min_detail.csv'), toCsv(slotHeaders, slotRows));
writeCsvUtf8Bom(path.join(dataDir, 'sankey_flows_15min.csv'), toCsv(flowHeaders, flowRows));
writeCsvUtf8Bom(
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
    dailyRows
  )
);

// 保留舊 15min 精簡檔（相容）由 detail 衍生
const legacy15 = slotRows.map((s) => ({
  date: s.date,
  time_slot: s.time_slot,
  slot_index: s.slot_index,
  generation_plan_kwh: s.generation_total_kwh,
  generation_actual_kwh: s.generation_total_kwh,
  load_plan_kwh: s.load_total_kwh,
  load_actual_kwh: s.load_total_kwh,
  storage_plan_kwh: s.storage_plan_kwh,
  storage_actual_kwh: s.storage_actual_kwh,
}));
writeCsvUtf8Bom(
  path.join(dataDir, 'sankey_explorer_15min.csv'),
  toCsv(
    [
      'date',
      'time_slot',
      'slot_index',
      'generation_plan_kwh',
      'generation_actual_kwh',
      'load_plan_kwh',
      'load_actual_kwh',
      'storage_plan_kwh',
      'storage_actual_kwh',
    ],
    legacy15
  )
);

console.log(`assets: ${ASSETS.length}`);
console.log(`slots: ${slotRows.length}, flows: ${flowRows.length}, days: ${dailyRows.length}`);
console.log(`written to ${dataDir}`);
