# ECVN 代理人註冊系統 — 後端 API 規格文件

**版本：** v1.0  
**日期：** 2026-04-13  
**作者：** Manus AI  
**後端技術棧：** FastAPI + Celery + RabbitMQ

---

## 一、概述

本文件定義了 ECVN 代理人註冊與資產綁定系統前端所需的全部後端 API 端點。前端使用 React + TypeScript + Vite + TailwindCSS 建置，透過 RESTful API 與 FastAPI 後端通訊。所有 API 均遵循 JSON 格式進行資料交換，並統一使用 Bearer Token 進行身份驗證。

### 通用回應格式

所有 API 回應均遵循以下統一信封格式：

```json
{
  "success": true,
  "message": "操作成功",
  "data": { ... },
  "error_code": null
}
```

當發生錯誤時：

```json
{
  "success": false,
  "message": "契約編號不存在",
  "data": null,
  "error_code": "CONTRACT_NOT_FOUND"
}
```

### 通用 HTTP 標頭

| 標頭名稱 | 值 | 說明 |
|---------|---|------|
| `Content-Type` | `application/json` | 請求與回應均為 JSON |
| `Authorization` | `Bearer <token>` | JWT 身份驗證令牌 |
| `Accept-Language` | `zh-TW` | 回應語言偏好 |

---

## 二、API 端點總覽

| 編號 | 方法 | 端點路徑 | 功能說明 | 對應步驟 |
|------|------|---------|---------|---------|
| 1 | `POST` | `/api/v1/applications` | 建立新申請單（取得申請單編號） | Step 1 |
| 2 | `PUT` | `/api/v1/applications/{app_id}` | 更新申請單基本資料 | Step 1 |
| 3 | `GET` | `/api/v1/applications/{app_id}` | 取得申請單完整資料 | 全域 |
| 4 | `POST` | `/api/v1/contracts/verify` | 驗證轉直供契約（查詢 CIS 資料庫） | Step 2 Modal |
| 5 | `POST` | `/api/v1/applications/{app_id}/contracts` | 綁定契約到申請單 | Step 2 |
| 6 | `PUT` | `/api/v1/applications/{app_id}/contracts/{contract_id}` | 更新已綁定契約資料 | Step 2 |
| 7 | `DELETE` | `/api/v1/applications/{app_id}/contracts/{contract_id}` | 移除已綁定契約 | Step 2 |
| 8 | `GET` | `/api/v1/applications/{app_id}/contracts` | 取得申請單所有契約 | Step 2 |
| 9 | `POST` | `/api/v1/applications/{app_id}/storages` | 綁定儲能設備到申請單 | Step 3 |
| 10 | `PUT` | `/api/v1/applications/{app_id}/storages/{storage_id}` | 更新已綁定儲能設備 | Step 3 |
| 11 | `DELETE` | `/api/v1/applications/{app_id}/storages/{storage_id}` | 移除已綁定儲能設備 | Step 3 |
| 12 | `GET` | `/api/v1/applications/{app_id}/storages` | 取得申請單所有儲能設備 | Step 3 |
| 13 | `POST` | `/api/v1/applications/{app_id}/submit` | 提交完成註冊流程 | Step 3 |
| 14 | `POST` | `/api/v1/contracts/sync-tpc` | 同步業務處資料（Celery 非同步任務） | Step 2 |

---

## 三、API 詳細規格

### 3.1 建立新申請單

建立一張新的代理人申請單，系統自動產生申請單編號與申請日期。

**端點：** `POST /api/v1/applications`

**請求參數：** 無（系統自動產生）

**回應：**

```json
{
  "success": true,
  "message": "申請單建立成功",
  "data": {
    "app_id": "APP-60447890",
    "apply_date": "2026-04-13",
    "status": "書審通過"
  }
}
```

| 回應欄位 | 型別 | 說明 |
|---------|------|------|
| `app_id` | `string` | 系統自動產生的申請單編號，格式 `APP-XXXXXXXX` |
| `apply_date` | `string` | 申請日期，格式 `YYYY-MM-DD` |
| `status` | `string` | 申請單初始狀態 |

---

### 3.2 更新申請單基本資料

更新 Step 1 中填寫的代理人基本資料。

**端點：** `PUT /api/v1/applications/{app_id}`

**路徑參數：**

| 參數 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `app_id` | `string` | 是 | 申請單編號 |

**請求 Body：**

```json
{
  "company_tax_id": "12345678",
  "agent_name": "王大明",
  "apply_type": "註冊登記合格交易者"
}
```

| 欄位 | 型別 | 必填 | 驗證規則 | 說明 |
|------|------|------|---------|------|
| `company_tax_id` | `string` | 是 | 正好 8 碼數字 | 公司統一編號 |
| `agent_name` | `string` | 是 | 1-50 字元 | 代理人姓名 |
| `apply_type` | `string` | 是 | `enum: ["註冊登記合格交易者", "資訊變更"]` | 申辦類型 |

**回應：**

```json
{
  "success": true,
  "message": "基本資料更新成功",
  "data": {
    "app_id": "APP-60447890",
    "company_tax_id": "12345678",
    "agent_name": "王大明",
    "apply_type": "註冊登記合格交易者",
    "apply_date": "2026-04-13",
    "status": "書審通過"
  }
}
```

---

### 3.3 取得申請單完整資料

取得指定申請單的完整資料，包含基本資料、契約清單與儲能設備清單。

**端點：** `GET /api/v1/applications/{app_id}`

**回應：**

```json
{
  "success": true,
  "data": {
    "app_id": "APP-60447890",
    "company_tax_id": "12345678",
    "agent_name": "王大明",
    "apply_type": "註冊登記合格交易者",
    "apply_date": "2026-04-13",
    "status": "書審通過",
    "contracts": [],
    "storages": []
  }
}
```

---

### 3.4 驗證轉直供契約（查詢 CIS 資料庫）

輸入 SERVICE_ID 後，向台電 CIS 資料庫查詢該契約的發電端與用電端配對資料。此為核心驗證 API，前端 Contract Modal 的「驗證」按鈕會呼叫此端點。

**端點：** `POST /api/v1/contracts/verify`

**請求 Body：**

```json
{
  "service_id": "14-9988-7766"
}
```

| 欄位 | 型別 | 必填 | 說明 |
|------|------|------|------|
| `service_id` | `string` | 是 | 轉直供契約編號 |

**成功回應：**

```json
{
  "success": true,
  "message": "CIS 資料庫連線成功，成功取得配對資料。",
  "data": {
    "master": {
      "service_id": "14-9988-7766",
      "applicant": "台灣半導體製造股份有限公司"
    },
    "gen": {
      "name": "南部科學園區一期光電案場",
      "elec_no": "01-1234-56",
      "meter_no": "M109876543",
      "capacity": 5000
    },
    "load": {
      "name": "台南研發中心廠區",
      "elec_no": "05-9876-54",
      "meter_no": "M301122334",
      "capacity": 4500
    }
  }
}
```

| 回應欄位 | 型別 | 說明 |
|---------|------|------|
| `master.service_id` | `string` | 主契約編號 |
| `master.applicant` | `string` | 申請者名稱 (APPL_NAME) |
| `gen.name` | `string` | 發電端案場名稱 |
| `gen.elec_no` | `string` | 發電端電號 |
| `gen.meter_no` | `string` | 發電端表號 |
| `gen.capacity` | `number` | 發電端裝置容量 (kW) |
| `load.name` | `string` | 用電端名稱 |
| `load.elec_no` | `string` | 用電端電號 |
| `load.meter_no` | `string` | 用電端表號 |
| `load.capacity` | `number` | 用電端契約容量 (kW) |

**失敗回應（契約不存在）：**

```json
{
  "success": false,
  "message": "查無此契約編號，請確認後重新輸入。",
  "data": null,
  "error_code": "CONTRACT_NOT_FOUND"
}
```

---

### 3.5 綁定契約到申請單

將驗證通過的契約綁定到指定申請單。

**端點：** `POST /api/v1/applications/{app_id}/contracts`

**請求 Body：**

```json
{
  "service_id": "14-9988-7766",
  "applicant": "台灣半導體製造股份有限公司",
  "gen": {
    "name": "南部科學園區一期光電案場",
    "elec_no": "01-1234-56",
    "meter_no": "M109876543",
    "capacity": 5000
  },
  "load": {
    "name": "台南研發中心廠區",
    "elec_no": "05-9876-54",
    "meter_no": "M301122334",
    "capacity": 4500
  }
}
```

**回應：**

```json
{
  "success": true,
  "message": "契約綁定成功",
  "data": {
    "contract_id": "CTR-001",
    "service_id": "14-9988-7766",
    "applicant": "台灣半導體製造股份有限公司",
    "gen": { "name": "南部科學園區一期光電案場", "elec_no": "01-1234-56", "meter_no": "M109876543", "capacity": 5000 },
    "load": { "name": "台南研發中心廠區", "elec_no": "05-9876-54", "meter_no": "M301122334", "capacity": 4500 }
  }
}
```

---

### 3.6 更新已綁定契約資料

編輯已綁定契約的端點資料（發電端/用電端名稱、電號、表號、容量等）。

**端點：** `PUT /api/v1/applications/{app_id}/contracts/{contract_id}`

**請求 Body：** 與 3.5 相同結構，僅傳送需要修改的欄位。

**回應：** 與 3.5 回應結構相同。

---

### 3.7 移除已綁定契約

**端點：** `DELETE /api/v1/applications/{app_id}/contracts/{contract_id}`

**回應：**

```json
{
  "success": true,
  "message": "契約已移除"
}
```

---

### 3.8 取得申請單所有契約

**端點：** `GET /api/v1/applications/{app_id}/contracts`

**回應：**

```json
{
  "success": true,
  "data": [
    {
      "contract_id": "CTR-001",
      "service_id": "14-9988-7766",
      "applicant": "台灣半導體製造股份有限公司",
      "gen": { "name": "南部科學園區一期光電案場", "elec_no": "01-1234-56", "meter_no": "M109876543", "capacity": 5000 },
      "load": { "name": "台南研發中心廠區", "elec_no": "05-9876-54", "meter_no": "M301122334", "capacity": 4500 }
    }
  ]
}
```

---

### 3.9 綁定儲能設備到申請單

將儲能設備完整登錄資料綁定到申請單。此 API 對應 Storage Modal 中的 70+ 個欄位。

**端點：** `POST /api/v1/applications/{app_id}/storages`

**請求 Body：**

```json
{
  "elec_no": "06-1234-56",
  "meter_no": "M998877665",
  "power": 500,
  "capacity": 2000,
  "charge_eff": 95.5,
  "discharge_eff": 93.2,
  "company_tax_id": "12345678",
  "gen_unit_id": "GU-001",
  "resource_code": "RES-001",
  "household_name": "儲能案場A",
  "resource_address": "台南市新營區中正路100號",
  "resource_district": "台南市",
  "max_net_output_mw": 10.5,
  "min_net_output_mw": 0.5,
  "rated_participation_capacity": 12.0,
  "aux_elec_no": "06-1234-57",
  "ami_meter_1": "AMI-001",
  "ami_meter_2": "AMI-002",
  "ami_meter_3": "AMI-003",
  "ami_meter_4": "AMI-004",
  "grid_voltage": 161,
  "registration_status": 1,
  "commission_date": "2025-06-15",
  "last_update_time": "2026-04-13T10:30:00",
  "last_update_staff_id": 12345,
  "resource_category_code": 3,
  "guarantee_deposit_status": 1,
  "aux_household_name": "輔助案場A",
  "grid_connection_line_id": "GL-001",
  "installed_capacity_mw": 15.0,
  "max_ramp_up_rate_mw": 5.0,
  "max_ramp_down_rate_mw": 5.0,
  "min_turnaround_time_h": 0.25,
  "min_downtime_h": 0.5,
  "peak_guaranteed_capacity": 8.0,
  "storage_max_capacity_mwh": 30.0,
  "storage_max_output_mw": 10.0,
  "frequency_response_normal_mw": 2.0,
  "resource_type": "BESS",
  "agent_resource_registration_address": "台北市信義區松仁路100號",
  "agent_resource_district": "台北市",
  "agent_resource_contact": "李小明",
  "contact_title": "專案經理",
  "contact_phone": "02-12345678",
  "contact_fax": "02-12345679",
  "contact_mobile": "0912345678",
  "contact_email": "test@example.com",
  "self_use_ratio": 0.15,
  "total_installed_capacity_kw": 15000,
  "total_installed_capacity_kwh": 30000,
  "charge_efficiency": 95.5,
  "discharge_efficiency": 93.2,
  "dod": 90,
  "max_charge_power_kw": 10000,
  "max_discharge_power_kw": 10000,
  "battery_type": "LFP",
  "battery_manufacturer": "寧德時代",
  "pcs_manufacturer": "台達電子",
  "warranty_start_date": "2025-06-15",
  "warranty_end_date": "2035-06-14",
  "expected_cycle_count": 6000,
  "current_cycle_count": 150,
  "soh": 99.5,
  "last_maintenance_date": "2026-03-01",
  "next_maintenance_date": "2026-09-01",
  "grid_code_compliance": "CNS 15382",
  "fire_safety_cert": "FSC-2025-001",
  "insurance_policy_no": "INS-2025-001"
}
```

由於儲能設備欄位眾多（70+ 欄位），以下僅列出前端 Step 3 表格中顯示的核心欄位與其驗證規則：

| 欄位 | 型別 | 必填 | 驗證規則 | 說明 |
|------|------|------|---------|------|
| `elec_no` | `string` | 是 | 非空 | 電號 |
| `meter_no` | `string` | 否 | — | 表號 |
| `power` | `number` | 否 | >= 0 | 裝置功率 (kW) |
| `capacity` | `number` | 否 | >= 0 | 裝置電量 (kWh) |
| `charge_eff` | `number` | 否 | 0-100 | 充電效率 (%) |
| `discharge_eff` | `number` | 否 | 0-100 | 放電效率 (%) |

> 完整的 70+ 欄位清單請參考前端 `client/src/lib/constants.ts` 中的 `STORAGE_FORM_FIELDS` 定義。每個欄位的 `id` 即為 API 請求 Body 中的 key。

**回應：**

```json
{
  "success": true,
  "message": "儲能設備綁定成功",
  "data": {
    "storage_id": "STG-001",
    "elec_no": "06-1234-56",
    "meter_no": "M998877665",
    "power": 500,
    "capacity": 2000,
    "charge_eff": 95.5,
    "discharge_eff": 93.2
  }
}
```

---

### 3.10 更新已綁定儲能設備

**端點：** `PUT /api/v1/applications/{app_id}/storages/{storage_id}`

**請求 Body：** 與 3.9 相同結構，僅傳送需要修改的欄位。

---

### 3.11 移除已綁定儲能設備

**端點：** `DELETE /api/v1/applications/{app_id}/storages/{storage_id}`

**回應：**

```json
{
  "success": true,
  "message": "儲能設備已移除"
}
```

---

### 3.12 取得申請單所有儲能設備

**端點：** `GET /api/v1/applications/{app_id}/storages`

**回應：**

```json
{
  "success": true,
  "data": [
    {
      "storage_id": "STG-001",
      "elec_no": "06-1234-56",
      "meter_no": "M998877665",
      "power": 500,
      "capacity": 2000,
      "charge_eff": 95.5,
      "discharge_eff": 93.2
    }
  ]
}
```

---

### 3.13 提交完成註冊流程

當使用者在 Step 3 點擊「完成全部註冊流程」時呼叫此 API，將申請單狀態變更為已提交。

**端點：** `POST /api/v1/applications/{app_id}/submit`

**請求 Body：** 無

**回應：**

```json
{
  "success": true,
  "message": "代理人註冊與資產綁定已全數完成，資料已寫入系統！",
  "data": {
    "app_id": "APP-60447890",
    "status": "已提交",
    "submitted_at": "2026-04-13T14:30:00+08:00"
  }
}
```

---

### 3.14 同步業務處資料（Celery 非同步任務）

Step 2 中的「同步業務處資料」開關開啟時，觸發 Celery 非同步任務，將契約資料同步至台電業務處系統。此為長時間執行的任務，建議使用 WebSocket 或輪詢機制回報進度。

**端點：** `POST /api/v1/contracts/sync-tpc`

**請求 Body：**

```json
{
  "app_id": "APP-60447890",
  "contract_ids": ["CTR-001", "CTR-002"]
}
```

**回應（任務已排入佇列）：**

```json
{
  "success": true,
  "message": "同步任務已排入佇列",
  "data": {
    "task_id": "celery-task-uuid-12345",
    "status": "PENDING"
  }
}
```

**任務狀態查詢端點：** `GET /api/v1/tasks/{task_id}`

```json
{
  "success": true,
  "data": {
    "task_id": "celery-task-uuid-12345",
    "status": "SUCCESS",
    "result": {
      "synced_count": 2,
      "failed_count": 0
    }
  }
}
```

| 任務狀態 | 說明 |
|---------|------|
| `PENDING` | 任務已排入佇列，等待執行 |
| `STARTED` | 任務正在執行中 |
| `SUCCESS` | 任務執行成功 |
| `FAILURE` | 任務執行失敗 |

---

## 四、錯誤碼對照表

| 錯誤碼 | HTTP 狀態碼 | 說明 |
|--------|-----------|------|
| `VALIDATION_ERROR` | 422 | 請求參數驗證失敗 |
| `CONTRACT_NOT_FOUND` | 404 | 查無此契約編號 |
| `APPLICATION_NOT_FOUND` | 404 | 查無此申請單 |
| `STORAGE_NOT_FOUND` | 404 | 查無此儲能設備 |
| `DUPLICATE_CONTRACT` | 409 | 該契約已綁定至此申請單 |
| `CIS_CONNECTION_ERROR` | 503 | CIS 資料庫連線失敗 |
| `TPC_SYNC_ERROR` | 503 | 業務處同步失敗 |
| `UNAUTHORIZED` | 401 | 未授權或 Token 過期 |
| `FORBIDDEN` | 403 | 無權限操作此資源 |

---

## 五、前端整合指引

### 5.1 API 客戶端設定

前端已在 `client/src/lib/api.ts` 中預留了 API 服務層，目前使用模擬資料。整合真實後端時，只需將模擬函式替換為實際的 HTTP 請求即可。建議使用 `axios` 或 `fetch` 搭配 FastAPI 自動產生的 OpenAPI TypeScript 客戶端。

### 5.2 FastAPI OpenAPI 自動產生客戶端

FastAPI 原生支援 OpenAPI 規格輸出，可透過以下指令自動產生 TypeScript 客戶端：

```bash
npx openapi-typescript-codegen \
  --input http://localhost:8000/openapi.json \
  --output ./client/src/lib/api-client \
  --client axios
```

### 5.3 Celery 任務進度回報

對於 3.14 同步業務處資料的長時間任務，建議在 FastAPI 端實作 WebSocket 端點 `/ws/tasks/{task_id}`，讓前端即時接收任務進度更新，而非使用輪詢機制。

---

## 六、資料模型對照

以下為前端 TypeScript 型別與後端 Pydantic Model 的對照關係：

| 前端 TypeScript 型別 | 後端 Pydantic Model | 說明 |
|---------------------|---------------------|------|
| `AppInfo` | `ApplicationSchema` | 申請單基本資料 |
| `Contract` | `ContractSchema` | 轉直供契約 |
| `ContractDbData` | `ContractVerifyResponse` | CIS 驗證回傳資料 |
| `StorageDevice` | `StorageDeviceSchema` | 儲能設備完整資料 |

前端型別定義檔位於 `client/src/types/index.ts`，後端可參考此檔案建立對應的 Pydantic Model。
