import type { LatLngLiteral } from '@/components/Map';

export interface AssetItem {
  id: string;
  name: string;
  no: string;
  meterNo?: string;
  address: string;
  capacityKw: number;
  transferRatio?: number;
  voltageLevel?: string;
  energyKwh?: number;
  roundTripEfficiency?: number;
  category: 'generation' | 'load' | 'storage';
  renewableType?: 'PV' | 'WIND';
  renewableCode?: string;
  fallbackPosition: LatLngLiteral;
}

/** 2.1 代理人資源聚合 — 與 1.1 註冊總覽共用同一份主檔 */
export interface Agent {
  id: number;
  name: string;
  taxId: string;
  registrationType: string;
  genCap: number;
  loadCap: number;
  storageCap: number;
  genMeters: number;
  loadMeters: number;
  bessCount: number;
  genList: AssetItem[];
  loadList: AssetItem[];
  storageList: AssetItem[];
}

/** 1.1 列表顯示用：狀態／更新日（主檔姓名、統編、註冊類型與 AGENTS 一致） */
export const AGENT_OVERVIEW_ROW_META: Record<number, { status: string; updatedAt: string }> = {
  1: { status: '已完成', updatedAt: '2026-04-03' },
  2: { status: '審核中', updatedAt: '2026-04-07' },
  3: { status: '已完成', updatedAt: '2026-04-05' },
  4: { status: '已完成', updatedAt: '2026-04-02' },
  5: { status: '審核中', updatedAt: '2026-04-09' },
};

export const AGENTS: Agent[] = [
  {
    id: 1, name: '台電綠能聚合商', taxId: '87654321', registrationType: '註冊登記合格交易者', genCap: 2500, loadCap: 1500, storageCap: 1000, genMeters: 2, loadMeters: 1, bessCount: 1,
    genList: [
      { id: 'gen-1', name: '南科一期光電', no: '01-1234-56', meterNo: 'M109876543', address: '台南市新市區南科三路17號', capacityKw: 1400, transferRatio: 100, category: 'generation', renewableType: 'PV', renewableCode: '13', fallbackPosition: { lat: 23.098, lng: 120.293 } },
      { id: 'gen-2', name: '嘉義義竹風機', no: '01-5678-90', meterNo: 'M208877665', address: '嘉義縣義竹鄉義竹村88號', capacityKw: 1100, transferRatio: 80, category: 'generation', renewableType: 'WIND', renewableCode: '12', fallbackPosition: { lat: 23.347, lng: 120.242 } },
    ],
    loadList: [
      { id: 'load-1', name: '新竹總部', no: '05-4321-98', meterNo: 'M301122334', voltageLevel: '11.4 kV', address: '新竹市東區光復路二段101號', capacityKw: 1500, category: 'load', fallbackPosition: { lat: 24.785, lng: 120.997 } },
    ],
    storageList: [
      { id: 'storage-1', name: '台南大儲', no: 'S-9999-01', meterNo: 'S-9999-01', address: '台南市安定區港口里66號', capacityKw: 1000, energyKwh: 3000, roundTripEfficiency: 85, category: 'storage', fallbackPosition: { lat: 23.119, lng: 120.237 } },
    ],
  },
  {
    id: 2, name: '永續綠能科技', taxId: '12345678', registrationType: '資訊變更', genCap: 4200, loadCap: 2000, storageCap: 2000, genMeters: 5, loadMeters: 1, bessCount: 2,
    genList: [
      { id: 'gen-3', name: '雲林光電群', no: '03-1111-22', meterNo: 'M508877611', address: '雲林縣麥寮鄉雲林路一段16號', capacityKw: 2400, transferRatio: 100, category: 'generation', renewableType: 'PV', renewableCode: '13', fallbackPosition: { lat: 23.789, lng: 120.257 } },
      { id: 'gen-4', name: '彰濱風機場', no: '03-2222-33', meterNo: 'M508877622', address: '彰化縣線西鄉彰濱工業區12號', capacityKw: 1800, transferRatio: 75, category: 'generation', renewableType: 'WIND', renewableCode: '12', fallbackPosition: { lat: 24.127, lng: 120.448 } },
    ],
    loadList: [
      { id: 'load-2', name: '中壢工廠', no: '06-5555-66', meterNo: 'M305566778', voltageLevel: '22.8 kV', address: '桃園市中壢區中華路一段12號', capacityKw: 2000, category: 'load', fallbackPosition: { lat: 24.965, lng: 121.223 } },
    ],
    storageList: [
      { id: 'storage-2', name: '桃園一號', no: 'S-8888-02', meterNo: 'S-8888-02', address: '桃園市觀音區大潭里18號', capacityKw: 1200, energyKwh: 3600, roundTripEfficiency: 84, category: 'storage', fallbackPosition: { lat: 25.035, lng: 121.051 } },
      { id: 'storage-3', name: '桃園二號', no: 'S-8888-03', meterNo: 'S-8888-03', address: '桃園市新屋區文化路99號', capacityKw: 800, energyKwh: 2400, roundTripEfficiency: 83, category: 'storage', fallbackPosition: { lat: 24.972, lng: 121.105 } },
    ],
  },
  {
    id: 3, name: '城市太陽能管理', taxId: '22334455', registrationType: '註冊登記合格交易者', genCap: 800, loadCap: 800, storageCap: 0, genMeters: 1, loadMeters: 1, bessCount: 0,
    genList: [
      { id: 'gen-5', name: '台北公有屋頂', no: '01-3333-44', meterNo: 'M700033344', address: '台北市信義區市府路1號', capacityKw: 800, transferRatio: 100, category: 'generation', renewableType: 'PV', renewableCode: '13', fallbackPosition: { lat: 25.037, lng: 121.563 } },
    ],
    loadList: [
      { id: 'load-3', name: '市府大樓', no: '05-6666-77', meterNo: 'M700056667', voltageLevel: '11.4 kV', address: '台北市信義區松智路5號', capacityKw: 800, category: 'load', fallbackPosition: { lat: 25.034, lng: 121.566 } },
    ],
    storageList: [],
  },
  {
    id: 4, name: '全球碳中和顧問', taxId: '99887766', registrationType: '註冊登記合格交易者', genCap: 1500, loadCap: 1200, storageCap: 500, genMeters: 3, loadMeters: 1, bessCount: 1,
    genList: [
      { id: 'gen-6', name: '高雄一廠光電', no: '07-7777-88', meterNo: 'M807777788', address: '高雄市岡山區本工東一路8號', capacityKw: 1500, transferRatio: 100, category: 'generation', renewableType: 'PV', renewableCode: '13', fallbackPosition: { lat: 22.797, lng: 120.296 } },
    ],
    loadList: [
      { id: 'load-4', name: '數據中心', no: '08-9999-00', meterNo: 'M809999900', voltageLevel: '22.8 kV', address: '高雄市前鎮區復興四路20號', capacityKw: 1200, category: 'load', fallbackPosition: { lat: 22.606, lng: 120.307 } },
    ],
    storageList: [
      { id: 'storage-4', name: '高雄微電網', no: 'S-7777-04', meterNo: 'S-7777-04', address: '高雄市路竹區環球路88號', capacityKw: 500, energyKwh: 1500, roundTripEfficiency: 82, category: 'storage', fallbackPosition: { lat: 22.864, lng: 120.258 } },
    ],
  },
  {
    id: 5, name: '智慧電網儲能系統', taxId: '55443322', registrationType: '資訊變更', genCap: 3000, loadCap: 2500, storageCap: 3000, genMeters: 1, loadMeters: 1, bessCount: 5,
    genList: [
      { id: 'gen-7', name: '大容量離岸風', no: '09-1234-99', meterNo: 'M909123499', address: '苗栗縣通霄鎮海濱路89號', capacityKw: 3000, transferRatio: 70, category: 'generation', renewableType: 'WIND', renewableCode: '12', fallbackPosition: { lat: 24.495, lng: 120.676 } },
    ],
    loadList: [
      { id: 'load-5', name: '竹科晶圓廠', no: '10-2222-11', meterNo: 'M102222211', voltageLevel: '22.8 kV', address: '新竹市東區力行一路1號', capacityKw: 2500, category: 'load', fallbackPosition: { lat: 24.780, lng: 121.000 } },
    ],
    storageList: [
      { id: 'storage-5', name: '連鎖儲能 A', no: 'S-6666-05', meterNo: 'S-6666-05', address: '新竹縣寶山鄉雙園路168號', capacityKw: 1200, energyKwh: 3600, roundTripEfficiency: 86, category: 'storage', fallbackPosition: { lat: 24.737, lng: 120.988 } },
      { id: 'storage-6', name: '連鎖儲能 B', no: 'S-6666-06', meterNo: 'S-6666-06', address: '新竹縣湖口鄉文化路66號', capacityKw: 1800, energyKwh: 5400, roundTripEfficiency: 87, category: 'storage', fallbackPosition: { lat: 24.902, lng: 121.044 } },
    ],
  },
];
