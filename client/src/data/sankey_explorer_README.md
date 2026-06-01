# 桑基明細詳細資料 CSV（v2）

預結算「桑基匹配明細表」與桑基圖的**唯一數值來源**。請在試算表編輯後存檔 **UTF-8（建議含 BOM）**，重新整理網頁即可。Excel 請用「資料 → 自文字/CSV」並選 UTF-8，或直接雙擊開啟（檔案已含 BOM）。

## 檔案一覽

| 檔案 | 說明 |
|------|------|
| `sankey_asset_registry.csv` | 電號主檔（G1～G5 發電、L1～L5 負載；含場站名稱 `site_name`、表號 `meter_number`） |

### 電號主檔 `sankey_asset_registry.csv`
| 欄位 | 說明 |
|------|------|
| `asset_id` | 電號 G1～G5、L1～L5 |
| `asset_type` | `generation` / `load` |
| `resource_type` | 太陽能、風力、工業負載等 |
| `site_name` | 場站名稱（顯示用，勿填表號） |
| `meter_number` | 表號（如 M301122334） |
| `capacity_kw` | 裝置容量 kW |
| `sankey_slots_15min_detail.csv` | **主事實表**：每 15 分鐘一列，含各電號 kW/kWh、儲能、合約、桑基節點加總 |
| `sankey_flows_15min.csv` | **流向明細**：桑基每一條邊（來源→去向），可對應電號 |
| `sankey_explorer_daily.csv` | 日彙總（由 15 分鐘自動加總，可覆寫校對） |

## 主表欄位 `sankey_slots_15min_detail.csv`

### 時間
| 欄位 | 說明 |
|------|------|
| `date` | 日期 YYYY-MM-DD |
| `time_slot` | 時段 HH:MM |
| `slot_index` | 0～95 |

### 發電電號（kW 為該 15 分鐘平均功率；kWh = kW × 0.25）
| 欄位 |
|------|
| `G1_kw` … `G5_kw` |
| `G1_kwh` … `G5_kwh` |
| `generation_total_kwh` | 發電加總 |

### 負載電號
| 欄位 |
|------|
| `L1_kw` … `L5_kw` |
| `L1_kwh` … `L5_kwh` |
| `load_total_kwh` | 用電加總 |

### 合約／儲能／匹配
| 欄位 | 說明 |
|------|------|
| `contract_transfer_kwh` | 合約轉供量 |
| `contract_matched_kwh` | 合約匹配量 |
| `storage_plan_kwh` | 儲能計畫排程（正=充、負=放） |
| `storage_actual_kwh` | 儲能量測 |
| `storage_charge_kwh` | 儲能存入(+) |
| `storage_discharge_kwh` | 儲能提領(-) |
| `prev_storage_balance_kwh` | 時段初儲能餘額 |
| `end_storage_balance_kwh` | 時段末儲能餘額 |
| `transfer_success_kwh` | 成功匹配量 |
| `surplus_kwh` | 餘電 |

### 桑基圖節點（與圖上名稱一致，單位 kWh）
| 欄位 | 節點 |
|------|------|
| `node_發電端_kwh` | 發電端 |
| `node_儲能餘額_kwh` | 儲能餘額 |
| `node_合約數量_kwh` | 合約數量 |
| `node_儲能_kwh` | 儲能 |
| `node_用電端_kwh` | 用電端 |
| `node_用電端轉移量_kwh` | 用電端轉移量 |
| `node_成功匹配量_kwh` | 成功匹配量 |
| `node_儲能存入量_kwh` | 儲能存入量 |
| `node_餘電_kwh` | 餘電 |

## 流向表 `sankey_flows_15min.csv`

| 欄位 | 說明 |
|------|------|
| `date`, `time_slot` | 時段 |
| `flow_id` | 唯一編號（如 F20260501080001） |
| `source_node` | 桑基來源節點 |
| `source_asset_id` | 來源電號（G1…G5 或空白=節點彙總） |
| `target_node` | 桑基去向節點 |
| `target_asset_id` | 去向電號（L1…L5 或空白） |
| `flow_kwh` | 流量 |
| `flow_type` | 類型標籤（generation_contract / storage_discharge 等） |
| `notes` | 備註 |

## 重新產生示範資料

```bash
node client/scripts/export-sankey-detail-csv.mjs
```

產生後會覆寫本目錄 CSV，並同步更新 `sankey_explorer_daily.csv`。
