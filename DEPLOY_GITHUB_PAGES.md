# ECVN 代理人註冊系統 — GitHub Pages 部署指南

**版本：** v1.0  
**日期：** 2026-04-13  
**作者：** Manus AI

---

## 一、前置說明

本專案使用 React + TypeScript + Vite 建置，需要先將原始碼 **build** 成靜態檔案後，才能部署到 GitHub Pages。GitHub Pages 僅支援純靜態網站（HTML/CSS/JS），因此部署的是前端 UI 與模擬資料的互動功能，後端 API（FastAPI + Celery + RabbitMQ）需另外部署。

本指南提供兩種部署方式：**GitHub Actions 自動部署**（推薦）與**手動部署**。兩種方式都需要先完成下方的專案設定調整。

---

## 二、專案設定調整（必做）

在部署之前，需要對專案做兩處關鍵設定調整。

### 2.1 設定 Vite 的 base 路徑

GitHub Pages 的網站 URL 格式為 `https://<username>.github.io/<repo-name>/`，因此所有靜態資源的路徑前綴必須加上 Repository 名稱。請開啟 `vite.config.ts`，在 `defineConfig` 中加入 `base` 設定：

```ts
// vite.config.ts
export default defineConfig({
  base: '/ecvn-registration/',   // ← 改成您的 Repository 名稱
  plugins,
  resolve: { ... },
  // ... 其餘設定不變
});
```

> **注意：** 如果您的 Repository 名稱不是 `ecvn-registration`，請替換為實際名稱。如果您使用的是 `<username>.github.io` 這種根網域 Repository，則 `base` 設為 `'/'` 即可。

### 2.2 設定 wouter 路由的 base 路徑

由於本專案使用 `wouter` 做客戶端路由，也需要告訴它正確的 base 路徑。請開啟 `client/src/App.tsx`，修改 `Router` 元件：

```tsx
// client/src/App.tsx
import { Route, Switch, Router as WouterRouter } from "wouter";

function Router() {
  return (
    <WouterRouter base="/ecvn-registration">
      <Switch>
        <Route path={"/"} component={Home} />
        <Route path={"/404"} component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </WouterRouter>
  );
}
```

### 2.3 新增 404.html 處理 SPA 路由

GitHub Pages 不支援伺服器端路由重寫，當使用者直接訪問子路徑時會出現 404 錯誤。需要新增一個 `404.html` 來將所有路由導回 `index.html`。請在 `client/public/` 目錄下建立 `404.html`：

```html
<!-- client/public/404.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>ECVN 代理人註冊系統</title>
    <script type="text/javascript">
      // GitHub Pages SPA 路由修復
      // 將 404 頁面重導向到 index.html，並保留原始路徑
      var pathSegmentsToKeep = 1; // Repository 名稱佔一段路徑
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
```

---

## 三、方式一：GitHub Actions 自動部署（推薦）

這是最推薦的方式。每次您推送程式碼到 `main` 分支時，GitHub Actions 會自動 build 並部署到 GitHub Pages。

### 步驟 1：建立 GitHub Actions 工作流程檔案

在專案根目錄建立 `.github/workflows/deploy.yml`：

```yaml
# .github/workflows/deploy.yml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]
  workflow_dispatch:    # 允許手動觸發

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 10

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Build
        run: pnpm vite build
        # 只 build 前端，不需要 esbuild server

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist/public'

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### 步驟 2：在 GitHub 上啟用 Pages

1. 前往您的 GitHub Repository 頁面
2. 點擊上方的 **Settings**（設定）
3. 在左側選單中找到 **Pages**
4. 在 **Source** 區塊中，選擇 **GitHub Actions**
5. 儲存設定

### 步驟 3：推送程式碼

```bash
git add .
git commit -m "feat: add GitHub Pages deployment"
git push origin main
```

推送後，GitHub Actions 會自動開始 build 與部署。您可以在 Repository 的 **Actions** 頁籤中查看部署進度。部署完成後，網站將可在以下網址訪問：

```
https://<您的GitHub帳號>.github.io/ecvn-registration/
```

---

## 四、方式二：手動部署

如果您不想使用 GitHub Actions，也可以手動 build 後推送到 `gh-pages` 分支。

### 步驟 1：在本機 build 專案

```bash
cd ecvn-registration
pnpm install
pnpm vite build
```

Build 完成後，靜態檔案會產生在 `dist/public/` 目錄中。

### 步驟 2：部署到 gh-pages 分支

使用 `gh-pages` 套件可以簡化這個流程。先安裝它：

```bash
pnpm add -D gh-pages
```

在 `package.json` 中新增部署指令：

```json
{
  "scripts": {
    "predeploy": "pnpm vite build",
    "deploy": "gh-pages -d dist/public"
  }
}
```

然後執行部署：

```bash
pnpm deploy
```

### 步驟 3：在 GitHub 上啟用 Pages

1. 前往 Repository 的 **Settings → Pages**
2. 在 **Source** 區塊中，選擇 **Deploy from a branch**
3. 在 **Branch** 下拉選單中，選擇 `gh-pages`，資料夾選 `/ (root)`
4. 點擊 **Save**

等待約 1-2 分鐘後，網站即可在 `https://<您的GitHub帳號>.github.io/ecvn-registration/` 訪問。

---

## 五、兩種方式比較

| 比較項目 | GitHub Actions 自動部署 | 手動部署 (gh-pages) |
|---------|----------------------|-------------------|
| 設定複雜度 | 需建立 workflow YAML 檔案 | 需安裝 gh-pages 套件 |
| 部署觸發 | 推送到 main 分支自動觸發 | 需手動執行 `pnpm deploy` |
| 本機是否需要 build | 不需要，CI 上 build | 需要在本機 build |
| 適合場景 | 團隊協作、持續部署 | 個人專案、偶爾更新 |
| 推薦程度 | 強烈推薦 | 適合快速測試 |

---

## 六、部署後驗證

部署完成後，請依序檢查以下項目確認網站正常運作：

| 驗證項目 | 預期結果 |
|---------|---------|
| 首頁載入 | 顯示 Step 1 基本資料表單，側邊欄與步驟指示器正常 |
| CSS 樣式 | TailwindCSS 樣式正確載入，無破版 |
| 字型載入 | Noto Sans TC 中文字型正常顯示 |
| Step 切換 | 填寫 Step 1 後可正常切換到 Step 2、Step 3 |
| Contract Modal | 點擊「匯入契約」可開啟 Modal，輸入契約編號可驗證 |
| Storage Modal | 點擊「綁定儲能」可開啟 Modal，所有欄位可填寫 |
| 瀏覽器 Console | 無 JavaScript 錯誤（404 資源載入錯誤除外） |

---

## 七、常見問題排解

### Q1：頁面空白，Console 顯示資源 404

這通常是 `base` 路徑設定錯誤。請確認 `vite.config.ts` 中的 `base` 值與您的 Repository 名稱完全一致（包含前後的 `/`）。

### Q2：直接訪問子路徑出現 GitHub 404 頁面

請確認已建立 `client/public/404.html` 檔案。GitHub Pages 不支援伺服器端路由重寫，需要透過 404.html 的 JavaScript 重導向來處理 SPA 路由。

### Q3：CSS 樣式沒有載入

請確認 build 指令使用的是 `pnpm vite build`（僅 build 前端），而非 `pnpm build`（會同時 build server 端，可能產生錯誤）。

### Q4：GitHub Actions 部署失敗

請檢查 Actions 頁籤中的錯誤日誌。常見原因包括 `pnpm-lock.yaml` 與 `package.json` 不同步（使用 `--frozen-lockfile` 時會報錯），此時需在本機執行 `pnpm install` 後重新 commit lock 檔案。

---

## 八、自訂網域（選用）

如果您希望使用自訂網域（例如 `ecvn.yourcompany.com`），請依照以下步驟操作：

1. 在 `client/public/` 目錄下建立 `CNAME` 檔案，內容為您的網域名稱：

```
ecvn.yourcompany.com
```

2. 在您的 DNS 服務商設定 CNAME 記錄，將網域指向 `<username>.github.io`

3. 在 GitHub Repository 的 **Settings → Pages → Custom domain** 中填入您的網域

4. 使用自訂網域時，`vite.config.ts` 中的 `base` 應改回 `'/'`

設定完成後約需等待 DNS 生效（通常 10 分鐘至 24 小時不等），即可透過自訂網域訪問網站。

---

## References

[1]: https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages "GitHub Pages 官方文件"
[2]: https://vitejs.dev/guide/static-deploy.html#github-pages "Vite 官方 GitHub Pages 部署指南"
[3]: https://github.com/tschaub/gh-pages "gh-pages npm 套件"
