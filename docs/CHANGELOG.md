# 更新日誌

所有重大變更皆記錄於此文件。格式參考 [Keep a Changelog](https://keepachangelog.com/)。

## [Unreleased]

### Changed
- API 文件與輸入驗證改用 Zod + `@asteasolutions/zod-to-openapi`：新增 `src/schemas/*.schema.js`、`src/openapi/registry.js`、`src/openapi/paths/*.paths.js`、`src/openapi/generator.js`、`src/middleware/validate.js`，取代 `swagger-jsdoc` 與六個路由檔中手刻的 if 驗證
- `generate-openapi.js` 產檔前以 `swagger-parser` 驗證規格合法性
- **行為微調**：`register`／建立訂單等端點的 email 驗證改用 Zod 內建 `.email()`，比舊版正規表示式更嚴格，極少數舊版視為合法的 email 格式（例如特殊字元組合）現在會被拒絕（400 VALIDATION_ERROR）；規格未明文規定 email 驗證的嚴謹程度，此為 Zod 型別檢查取代手刻正規表示式的自然結果，非刻意收緊業務規則
- **行為微調**：購物車 `quantity` 驗證改用 `z.union([z.number(), z.string().regex(/^\d+$/)])`，明確拒絕 boolean（如 `true`）與科學記號字串（如 `"1e2"`），修正原 `z.coerce.number()` 過於寬鬆意外將其轉換為合法數字的問題

### Added
- 新增 `GET /openapi.json`（回傳 OpenAPI document）與 `GET /api-docs` Swagger UI 瀏覽頁
- 綠界 ECPay AIO 金流串接：結帳後導向綠界付款頁面完成真實付款流程
- 新增 `src/utils/ecpay.js` 工具模組：CheckMacValue 簽章產生/驗證、ECPay 專用 URL 編碼、QueryTradeInfo API 查詢
- 新增 `GET /ecpay/payment/:orderId` 頁面路由：產生自動送出的 ECPay 付款表單
- 新增 `POST /api/orders/:id/check-payment` API：透過 QueryTradeInfo API 主動查詢付款狀態（取代本地端無法接收的 Server Notify）
- 訂單新增 `merchant_trade_no` 欄位：對應綠界 MerchantTradeNo，由 order_no 去除連字號產生

### Changed
- 結帳頁面（checkout.js）：送出訂單後導向綠界付款頁面，不再直接跳轉訂單詳情
- 訂單詳情頁面（order-detail.ejs / order-detail.js）：原「付款成功/失敗」模擬按鈕改為「查詢付款狀態」與「前往付款」按鈕；從綠界導回時自動觸發付款狀態查詢

## [1.0.0] - 2026-04-12

### 新增
- 使用者註冊、登入、個人資料 API
- 商品列表與詳情 API（公開）
- 購物車 CRUD API（雙模式認證：JWT / X-Session-Id）
- 訂單建立、查詢、模擬付款 API
- 後台商品管理 API（CRUD）
- 後台訂單查詢 API（含狀態篩選）
- EJS 前台頁面（首頁、商品詳情、購物車、結帳、訂單）
- EJS 後台頁面（商品管理、訂單管理）
- SQLite 資料庫自動初始化與種子資料
- Vitest 測試套件（6 個測試檔案，循序執行）
- Swagger/OpenAPI 文件生成
- Tailwind CSS 樣式系統
- 專案文件結構建立
