# Integration Test、E2E Test 與 Postman Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增獨立資料庫的 Integration Test、真實瀏覽器驅動的 E2E Test（含綠界付款流程），並調整 Postman Collection 產生流程的變數命名與版控策略。

**Architecture:** `src/database.js` 的資料庫路徑改為可由 `DATABASE_PATH` 環境變數覆寫，預設行為不變；新增 `vitest.integration.config.js` 專門跑 `tests/integration/**`、注入 `DATABASE_PATH=':memory:'`，與主設定互斥。E2E 用 Playwright 直接操作已啟動的本機伺服器與真實綠界 staging／土地銀行測試頁面，前端模板補上 `data-testid` 供穩定選取。Postman 產生器對 `openapi-to-postmanv2` 輸出的 collection 做後處理，將其預設的 `bearerToken` 變數統一改名為 `token`，並在 environment 新增 `sessionId`。

**Tech Stack:** Vitest（既有）、Supertest（既有）、better-sqlite3 `:memory:`、Playwright（新增）、openapi-to-postmanv2（既有）。

**Spec:** `docs/plans/2026-09-27-integration-e2e-postman.md`（本檔案下方 User Story / Spec 兩節）

## 執行紀錄（全部完成，2026-09-27）

以 `superpowers:executing-plans` Native 方式逐一執行，每個 Task 的完成證據皆為實際跑過的測試指令與其輸出，並以獨立 commit 落地。以下對照表為完成後回填（原執行過程中的完整 Ruling／發現記錄留存於本機 `.superpowers/sdd/2026-09-27-integration-e2e-postman/progress.md`，該檔為 gitignore 暫存 ledger，不隨版控保留，故關鍵決策已摘錄於此，成為本文件的一部分）：

| Task | 狀態 | Commit | 驗證 |
|------|------|--------|------|
| 1. `DATABASE_PATH` 覆寫 | ✅ 完成 | `ebfb616` | `npm test` 12 檔全綠 |
| 2. Integration Test 設定 | ✅ 完成 | `ff6c478` | `npm run test:integration` 通過 |
| 3. 訂單建立流程 Integration Test | ✅ 完成 | `0db3d02` | `npm run test:integration` 4/4 通過 |
| 4. Playwright 安裝與設定 | ✅ 完成 | `c760be2` | `npm run test:e2e` 1/1 通過（smoke） |
| 5. `data-testid` 補強 | ✅ 完成 | `fcf3c4c` | `npm test` 12 檔全綠 |
| 6. 真實綠界／土地銀行流程探索 | ✅ 完成（探索性質，依計畫本文無需 commit） | — | 拋棄式腳本實測全流程通過，發現記錄見下 |
| 7. 正式 E2E Spec | ✅ 完成 | `54ea5c9` | `npm run test:e2e` 1/1 通過，含真實綠界付款成功截圖 |
| 8. Postman `bearerToken`→`token` 改名 | ✅ 完成 | `23d276e` | `tests/postman.generator.test.js` 5/5 通過 |
| 9. `postman/collection.json` 移出版控 | ✅ 完成 | `41ba5ea` | `git status` 確認已移除追蹤、本機檔案仍在 |
| 10. 文件同步與最終驗證 | ✅ 完成 | `b82ff54` | `npm test`/`test:unit`/`test:integration`/`openapi`/`postman` 全數成功 |
| 最終整體審查（獨立 opus 子代理）與修正 | ✅ 完成 | `89c627f` | 3 項 Important 已修正並以 TDD 驗證，8 項 Minor 列為延後事項（見下） |

**執行過程中的關鍵裁決（Ruling）：**
- Task 3：brief 原假設「price < 1500」商品乘以數量 2 必低於免運門檻，實際第一個符合商品（白色百合花禮盒 1280）會觸發「小計 ≥1500 時宅配免基本運費」規則，導致運費斷言錯誤。改用結構性條件 `price * 2 < 1500`，不寫死商品名稱。
- Task 5：`vitest.config.js` 的 exclude 補上 `tests/e2e/**`，修正 Task 2／Task 4 交界處遺漏（Vitest 預設 include 會誤跑 Playwright 的 `.spec.js`）。
- Task 6（探索）：確認綠界「返回商店」後導回 `/orders/:id?payment=pending`，`order-detail.js` 的 `onMounted` 會依此參數自動觸發付款狀態查詢，Task 7 的 E2E 不需要手動點擊「查詢付款狀態」按鈕。
- Task 7：brief 骨架讀取 JWT 用的 `localStorage.getItem('token')` 鍵名有誤，實際專案鍵名為 `flower_token`（見 `public/js/auth.js`），已修正。

**最終審查修正（commit `89c627f`）：**
1. Integration Test 的 in-memory 驗證原本只檢查環境變數是否注入，改為直接斷言 `db.memory`/`db.name`，確保 `DATABASE_PATH` 真的生效。
2. E2E 加入購物車原本挑選清單第一項，會選到主測試套件殘留、庫存持續遞減的測試商品，長期執行會售完逾時；改用固定種子商品（繽紛向日葵花束）鎖定。
3. `docs/README.md`／`docs/CHANGELOG.md` 修正仍描述舊版 `bearerToken` 的敘述，統一為 `token`／`sessionId`。

**延後事項（Minor，未修正，供後續維護參考）：** E2E 的 paid 驗證僅依賴單次自動查詢、未做輪詢重試；加入購物車後未等待 API 回應即導頁；Integration Test 庫存不足情境未明確斷言 `order_items` 無新列；`postman/environment.json` 的 `sessionId` 變數目前無請求實際使用；Postman 改名測試覆蓋率可再加強；`vitest.config.js` 的 exclude 覆寫遺失 Vitest 預設排除項；`docs/ARCHITECTURE.md` 與專案 `CLAUDE.md` 尚未同步列出本次新增指令。

## Global Constraints

- `src/database.js` 的預設路徑與現有生產/測試行為完全不變；`DATABASE_PATH` 環境變數為新增的可選覆寫，未設定時行為與修改前完全一致。
- Integration Test 一律使用 `:memory:` SQLite，絕不可連到專案根目錄的 `database.sqlite`。
- E2E Test 假設 `http://localhost:3001` 已由使用者另行啟動（`npm run start`），Playwright 設定檔**不**設定 `webServer` 自動啟動邏輯。
- 回應/DB 欄位沿用專案既有 snake_case／camelCase 慣例（見先前配送費用模組的 Global Constraints）；本計畫不重複列出，執行者遇到欄位命名問題時比照既有程式碼風格。
- Postman 變數統一為 `baseUrl`／`token`／`sessionId`；`postman/collection.json` 為建置產物，禁止提交；`postman/environment.json` 為手動維護設定檔，允許提交。
- `playwright-report/`、`test-results/`、`tests/e2e/screenshots/`、`postman/collection.json` 一律加入 `.gitignore`。
- 探索綠界/土地銀行真實頁面所需的拋棄式腳本不納入版控，僅在執行期間存在於 scratchpad 或本機暫存。

## Review Focus

- Integration Test 的「訂單建立失敗時不留下不完整訂單／不誤扣庫存」必須是**路由層級**的庫存檢查失敗（在 `db.transaction()` 啟動前就被攔截），而非單純「購物車為空」——需要一筆測試模擬「加入購物車時庫存足夠、建立訂單前庫存被其他操作耗盡」的情境，直接驗證 `orders`／`order_items` 無新列、`products.stock` 未被二次扣減、`cart_items` 未被清空，否則只測空購物車無法證明真正的庫存不足路徑不會留下髒資料。
- `vitest.integration.config.js` 的 `DATABASE_PATH=':memory:'` 必須確實在 `require('../app')` 執行**之前**生效——需要一筆測試直接斷言目前連線是 in-memory（例如查詢後確認找不到正式 `database.sqlite` 中才會有的既有種子訂單，或直接斷言 `db.name` 相關屬性），避免因 Vitest 設定寫錯而讓 Integration Test 悄悄跑在正式資料庫上又矇混過關。
- E2E 測試對「訂單狀態為 paid」的驗證不能只看畫面文字（`statusMap` 已把 `paid` 轉譯成中文「已付款」），必須額外用 API（`GET /api/orders/:id`）或資料庫直接確認 `status === 'paid'`，避免畫面顯示正確但底層狀態其實沒更新的情況被誤判為通過。
- Postman 產生器把 `bearerToken` 改名為 `token` 後，需要確認**所有**受保護端點（不只 auth 相關）的 `request.auth.bearer[0].value` 都同步改名，而不是只改登入/註冊的 test script；否則會出現 test script 寫入 `token`、但其他請求的 Authorization 仍讀取已不存在的 `bearerToken` 的不一致。
- `postman/collection.json` 移出版控後，`tests/postman.generator.test.js` 中原本可能隱含依賴「檔案已存在於磁碟」的測試（若有）需要確認全部改為只呼叫 `generateCollection()` 函式本身、不依賴磁碟上是否已有舊檔案，否則會出現「本機第一次乾淨 checkout 後測試找不到檔案」的情境。（已於自我校閱時查證：現有 `tests/postman.generator.test.js` 完全未 `require`／`readFileSync` 磁碟上的 `collection.json`，全部斷言皆針對 `generateCollection()` 函式的回傳值，此疑慮已被既有設計滿足，Task 8 僅需處理變數改名相關的斷言文字。）

---

## User Story

作為開發者，我希望有獨立於正式資料庫的 Integration Test 驗證訂單建立的完整資料寫入與原子性；作為 QA，我希望有一條涵蓋登入到綠界付款成功的 E2E 測試證明真實使用者流程可行；作為串接第三方的開發者，我希望有一份變數命名符合團隊慣例（`token`／`sessionId`）、可直接匯入使用的 Postman Collection，且測試/產出物不會污染版控歷史。

## Spec

（同前次設計訊息，此處保留供對照，詳細規則見各 Task 之 Files/Interfaces/Steps。）

### Integration Test
- `src/database.js`：`dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite')`
- `vitest.integration.config.js`：`test.env.DATABASE_PATH = ':memory:'`，`test.include` 僅 `tests/integration/**/*.test.js`
- 主 `vitest.config.js` 新增 `test.exclude` 排除 `tests/integration/**`
- `tests/integration/order-flow.integration.test.js`：註冊/登入 → 取商品 → 加購物車 → 建立訂單 → 驗證 DB 寫入/運費/庫存/購物車清空；兩個失敗情境（購物車為空、庫存不足）驗證不留髒資料

### E2E Test
- Playwright，`baseURL: http://localhost:3001`，不自動啟動伺服器
- `data-testid` 補強選擇器穩定性
- 16 步真實流程，最終截圖存證
- 先以拋棄式探索腳本取得真實選擇器，再收斂為正式 spec

### Postman
- `bearerToken` → `token` 全域改名（generator 後處理）
- `environment.json` 新增 `sessionId`
- `collection.json` 移出版控

### npm scripts
`test:unit`／`test:integration`／`test:e2e`／`postman`／`test` 五項齊備。

---

### Task 1: `src/database.js` 支援 `DATABASE_PATH` 環境變數覆寫

**Files:**
- Modify: `src/database.js`

**Interfaces:**
- Produces: `process.env.DATABASE_PATH` 未設定時行為不變；設為 `:memory:` 或任意路徑時，`db` 連線改指向該路徑。Task 2（vitest.integration.config.js）消費此環境變數。

- [x] **Step 1: 修改 `src/database.js` 第 6 行**

把：
```js
const dbPath = path.join(__dirname, '..', 'database.sqlite');
```
改為：
```js
const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'database.sqlite');
```

- [x] **Step 2: 手動驗證預設行為不變**

```bash
rm -f database.sqlite database.sqlite-wal database.sqlite-shm
node -e "const db = require('./src/database'); console.log(db.prepare('SELECT COUNT(*) as c FROM products').get());"
ls database.sqlite
```
Expected: 印出 `{ c: 8 }`（8 個種子商品），且 `database.sqlite` 檔案確實存在於專案根目錄。

- [x] **Step 3: 手動驗證 `DATABASE_PATH=:memory:` 時不建立/不影響正式檔案**

```bash
rm -f database.sqlite database.sqlite-wal database.sqlite-shm
DATABASE_PATH=":memory:" node -e "const db = require('./src/database'); console.log(db.prepare('SELECT COUNT(*) as c FROM products').get());"
ls database.sqlite 2>&1
```
Expected: 印出 `{ c: 8 }`，第二個 `ls` 指令應印出 `No such file or directory`（因為記憶體 DB 不寫入磁碟，且上一步已先刪除該檔案）。

- [x] **Step 4: 執行既有全套測試確認未破壞**

```bash
npm test
```
Expected: 12 個測試檔全數 PASS（既有行為不變，因為預設值未變動）。

- [x] **Step 5: Commit**

```bash
git add src/database.js
git commit -m "$(cat <<'EOF'
feat: src/database.js 支援 DATABASE_PATH 環境變數覆寫資料庫路徑

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Integration Test 專用 Vitest 設定與 npm script

**Files:**
- Create: `vitest.integration.config.js`
- Modify: `vitest.config.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `DATABASE_PATH`（Task 1）。
- Produces: `npm run test:integration` 執行 `tests/integration/**/*.test.js`，且該目錄下的檔案不會被 `npm run test`（主設定）重複執行。Task 3 的測試檔即放在此目錄下。

- [x] **Step 1: 建立 `vitest.integration.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    include: ['tests/integration/**/*.test.js'],
    env: {
      DATABASE_PATH: ':memory:',
    },
    hookTimeout: 10000,
  },
});
```

- [x] **Step 2: 修改主 `vitest.config.js`，排除 integration 目錄**

把：
```js
export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    sequence: {
```
改為：
```js
export default defineConfig({
  test: {
    globals: true,
    fileParallelism: false,
    exclude: ['**/node_modules/**', 'tests/integration/**'],
    sequence: {
```

（Vitest 預設 `exclude` 已包含 `node_modules` 等常見目錄，此處明確寫出 `**/node_modules/**` 是為了覆寫預設陣列時不遺漏，避免不小心讓 `node_modules` 底下的套件測試被掃到。）

- [x] **Step 3: 新增 `package.json` script**

在 `"test:unit"` 之後、`"test"` 之前加入：
```json
"test:integration": "vitest run --config vitest.integration.config.js",
```

- [x] **Step 4: 建立佔位測試檔驗證設定正確**

建立 `tests/integration/_setup-check.integration.test.js`（此檔案為本步驟的驗證用途，Task 3 完成後會被正式測試檔取代，若 Task 3 未取代則保留亦不影響其他測試）：

```js
describe('integration test environment', () => {
  it('runs against an in-memory database, not the real database.sqlite', () => {
    expect(process.env.DATABASE_PATH).toBe(':memory:');
    const db = require('../../src/database');
    const productCount = db.prepare('SELECT COUNT(*) as c FROM products').get().c;
    expect(productCount).toBe(8); // 種子資料剛建立，僅有 8 個商品，證明是全新的記憶體 DB
  });
});
```

- [x] **Step 5: 執行驗證**

```bash
npm run test:integration
```
Expected: PASS（1 個測試通過）。

- [x] **Step 6: 確認主測試套件不會重複執行此目錄**

```bash
npm test 2>&1 | grep -c "integration"
```
Expected: 印出 `0`（主 `npm test` 的輸出中完全不出現 `integration` 字樣，代表該目錄未被主設定掃到）。

- [x] **Step 7: Commit**

```bash
git add vitest.integration.config.js vitest.config.js package.json tests/integration/_setup-check.integration.test.js
git commit -m "$(cat <<'EOF'
feat: 新增 Integration Test 專用 Vitest 設定與 npm run test:integration

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 訂單建立流程 Integration Test

**Files:**
- Create: `tests/integration/order-flow.integration.test.js`
- Delete: `tests/integration/_setup-check.integration.test.js`（其驗證目的已被本檔案涵蓋）

**Interfaces:**
- Consumes: `app`/`request`/`registerUser`/`getAdminToken`（`tests/setup.js`，沿用既有匯出）、`db`（`src/database.js`，記憶體模式）。

- [x] **Step 1: 刪除佔位測試檔，建立正式測試檔**

```bash
rm tests/integration/_setup-check.integration.test.js
```

建立 `tests/integration/order-flow.integration.test.js`：

```js
const { app, request, registerUser, getAdminToken } = require('../setup');
const db = require('../../src/database');

describe('Order creation flow (integration, in-memory DB)', () => {
  it('confirms this suite runs against an isolated in-memory database', () => {
    expect(process.env.DATABASE_PATH).toBe(':memory:');
  });

  it('completes the full flow: register -> get products -> add to cart -> create order, with correct DB writes', async () => {
    // 1. 註冊會員並登入
    const { token, user } = await registerUser();
    expect(token).toBeTruthy();

    // 2. 取得商品資料
    const productsRes = await request(app).get('/api/products');
    expect(productsRes.status).toBe(200);
    expect(productsRes.body.data.products.length).toBeGreaterThan(0);
    const product = productsRes.body.data.products.find((p) => p.price < 1500 && p.stock >= 2);
    const stockBefore = product.stock;

    // 3. 加入購物車
    const addCartRes = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: product.id, quantity: 2 });
    expect(addCartRes.status).toBe(200);

    // 4. 建立含配送方式與配送資訊的訂單
    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: 'Integration 測試收件人',
        recipientEmail: 'integration-test@example.com',
        recipientAddress: '台北市整合測試路 1 號',
        shippingMethod: 'home_delivery',
        isRemoteArea: true,
        isRushDelivery: false
      });

    // 5. 驗證訂單建立結果：HTTP 狀態碼與回應格式
    expect(createRes.status).toBe(201);
    expect(createRes.body).toHaveProperty('error', null);
    expect(createRes.body).toHaveProperty('message');
    const orderId = createRes.body.data.id;

    const expectedSubtotal = product.price * 2;
    const expectedShippingFee = 120 + 200; // home_delivery 基本運費 + 偏遠地區附加費
    expect(createRes.body.data.subtotal).toBe(expectedSubtotal);
    expect(createRes.body.data.shipping_fee).toBe(expectedShippingFee);
    expect(createRes.body.data.total_amount).toBe(expectedSubtotal + expectedShippingFee);

    // 訂單是否正確寫入
    const orderRow = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(orderRow).toBeTruthy();
    expect(orderRow.user_id).toBe(user.id);
    expect(orderRow.total_amount).toBe(expectedSubtotal + expectedShippingFee);
    expect(orderRow.shipping_method).toBe('home_delivery');
    expect(orderRow.is_remote_area).toBe(1);

    // 訂單品項是否正確寫入
    const itemRows = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    expect(itemRows.length).toBe(1);
    expect(itemRows[0].product_id).toBe(product.id);
    expect(itemRows[0].quantity).toBe(2);
    expect(itemRows[0].product_price).toBe(product.price);

    // 商品庫存是否正確扣除
    const productAfter = db.prepare('SELECT stock FROM products WHERE id = ?').get(product.id);
    expect(productAfter.stock).toBe(stockBefore - 2);

    // 建立訂單後購物車是否清空
    const cartRows = db.prepare('SELECT * FROM cart_items WHERE user_id = ?').all(user.id);
    expect(cartRows.length).toBe(0);
  });

  it('does not create a partial order or double-deduct stock when creation fails due to an empty cart', async () => {
    const { token, user } = await registerUser();

    const orderCountBefore = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '空車測試',
        recipientEmail: 'empty-cart-test@example.com',
        recipientAddress: '台北市空車測試路 1 號',
        shippingMethod: 'home_delivery'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CART_EMPTY');

    const orderCountAfter = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
    expect(orderCountAfter).toBe(orderCountBefore);

    const userOrders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(user.id);
    expect(userOrders.length).toBe(0);
  });

  it('does not create a partial order, double-deduct stock, or clear the cart when stock becomes insufficient before order creation', async () => {
    const adminToken = await getAdminToken();
    const createProductRes = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Integration 庫存測試商品', price: 300, stock: 1 });
    const scarceProductId = createProductRes.body.data.id;

    const { token, user } = await registerUser();

    // 加入購物車時庫存足夠（1 件庫存，加 1 件）
    const addCartRes = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: scarceProductId, quantity: 1 });
    expect(addCartRes.status).toBe(200);

    // 模擬下單前庫存被其他操作耗盡（例如另一筆併發訂單搶先扣光）
    db.prepare('UPDATE products SET stock = 0 WHERE id = ?').run(scarceProductId);

    const orderCountBefore = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '庫存不足測試',
        recipientEmail: 'stock-insufficient-test@example.com',
        recipientAddress: '台北市庫存不足測試路 1 號',
        shippingMethod: 'home_delivery'
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('STOCK_INSUFFICIENT');

    // 不留下不完整訂單
    const orderCountAfter = db.prepare('SELECT COUNT(*) as c FROM orders').get().c;
    expect(orderCountAfter).toBe(orderCountBefore);
    const userOrders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(user.id);
    expect(userOrders.length).toBe(0);

    // 不會錯誤扣除庫存（維持在被模擬耗盡的 0，而非變成負數或其他值）
    const productAfter = db.prepare('SELECT stock FROM products WHERE id = ?').get(scarceProductId);
    expect(productAfter.stock).toBe(0);

    // 購物車未被清空（因為 transaction 從未開始）
    const cartRows = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').all(user.id, scarceProductId);
    expect(cartRows.length).toBe(1);
  });
});
```

- [x] **Step 2: 執行測試**

```bash
npm run test:integration
```
Expected: PASS（4 個 it 全數通過：環境確認 1 筆＋完整流程 1 筆＋兩個失敗情境 2 筆）。

- [x] **Step 3: 確認記憶體 DB 確實未觸碰正式資料庫**

```bash
ls database.sqlite 2>&1
```
Expected: 若先前步驟未執行過會建立正式 DB 的指令，此處應印出 `No such file or directory`（本計畫的所有 Integration Test 相關指令皆不應建立此檔案）；若專案根目錄本來就已存在 `database.sqlite`（例如先前手動啟動過伺服器），改為執行 `npm run test:integration` 前後比較檔案的最後修改時間（`ls -la database.sqlite`）應完全不變。

- [x] **Step 4: 執行主測試套件確認互不干擾**

```bash
rm -f database.sqlite database.sqlite-wal database.sqlite-shm
npm test
```
Expected: 12 個測試檔全數 PASS，與 Integration Test 無關。

- [x] **Step 5: Commit**

```bash
git add tests/integration/order-flow.integration.test.js
git rm tests/integration/_setup-check.integration.test.js
git commit -m "$(cat <<'EOF'
test: 新增訂單建立流程 Integration Test（獨立記憶體資料庫）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Playwright 安裝與設定

**Files:**
- Modify: `package.json`
- Create: `playwright.config.js`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `npm run test:e2e` 執行 `tests/e2e/**/*.spec.js`，`baseURL` 為 `http://localhost:3001`，不自動啟動伺服器。Task 6/7 消費此設定。

- [x] **Step 1: 安裝 Playwright**

```bash
npm install -D @playwright/test
npx playwright install chromium
```

- [x] **Step 2: 建立 `playwright.config.js`**

```js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'tests/e2e',
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

（刻意不設定 `webServer` 選項——依專案規格，E2E 測試假設 `http://localhost:3001` 已由使用者另行以 `npm run start` 啟動。）

- [x] **Step 3: 新增 `package.json` script**

在 `"test"` 之後加入：
```json
"test:e2e": "playwright test",
```

- [x] **Step 4: 更新 `.gitignore`**

在檔案末尾加入：
```
# Playwright
/test-results/
/playwright-report/
/tests/e2e/screenshots/
```

- [x] **Step 5: 建立最小驗證用 spec 確認設定可執行**

先手動啟動伺服器（另開一個 terminal，或在此步驟以背景方式啟動）：
```bash
npm run start &
sleep 2
```

建立 `tests/e2e/_smoke.spec.js`（本步驟驗證用，Task 7 完成後刪除）：
```js
const { test, expect } = require('@playwright/test');

test('home page loads from the already-running server', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/.+/);
});
```

- [x] **Step 6: 執行驗證**

```bash
npm run test:e2e
```
Expected: PASS（1 個測試通過，證明 Playwright 能連上已啟動的 `localhost:3001`）。

- [x] **Step 7: Commit**

```bash
git add package.json playwright.config.js .gitignore tests/e2e/_smoke.spec.js
git commit -m "$(cat <<'EOF'
feat: 新增 Playwright 設定與 npm run test:e2e（假設伺服器已啟動）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 前端模板補上 `data-testid` 供 E2E 穩定選取

**Files:**
- Modify: `views/pages/login.ejs`
- Modify: `views/pages/index.ejs`
- Modify: `views/pages/checkout.ejs`
- Modify: `views/pages/order-detail.ejs`

**Interfaces:**
- Produces: 各元素的 `data-testid` 屬性名稱，Task 7（E2E spec）消費這些確切名稱：
  - 登入：`data-testid="login-email"`、`login-password`、`login-submit`
  - 首頁商品卡片的加入購物車按鈕：`data-testid="add-to-cart"`（同一頁可能有多個，Playwright 用 `.first()` 或依商品名稱定位父層卡片）
  - 結帳頁：`data-testid="shipping-home-delivery"`、`shipping-convenience-store`、`shipping-remote-area"`、`shipping-rush-delivery`、`checkout-submit`
  - 訂單詳情頁狀態徽章：`data-testid="order-status"`

純附加屬性，不影響既有 `class`／`v-model`／樣式與行為。

- [x] **Step 1: 修改 `views/pages/login.ejs`**

找到 email／password 的 `<input>` 與送出按鈕，各自加上 `data-testid`：
```html
<input v-model="loginForm.email" type="email" ... data-testid="login-email" />
<input v-model="loginForm.password" type="password" ... data-testid="login-password" />
```
以及送出按鈕（文字為「登入」的 `<button>`）加上 `data-testid="login-submit"`。

（因無法在此列出該檔案每一行既有屬性的精確順序，執行者請開啟 `views/pages/login.ejs`，在上述兩個 `<input>` 與送出 `<button>` 的既有屬性清單中，比照本專案既有屬性換行風格，各自新增一行 `data-testid="..."`，不得刪除或調整既有屬性。）

- [x] **Step 2: 修改 `views/pages/index.ejs`**

找到 `@click.stop="addToCart(product)"` 的按鈕，加上 `data-testid="add-to-cart"`（同一屬性值會出現在每張商品卡片上，這是預期行為，Playwright 測試會用 `page.getByTestId('add-to-cart').first()` 或先用商品名稱定位卡片範圍再找按鈕）。

- [x] **Step 3: 修改 `views/pages/checkout.ejs`**

在 Task 6（前一輪配送費用模組）新增的四個 `<input>`（兩個 radio、兩個 checkbox）與送出按鈕，各自加上：
```html
<input type="radio" v-model="form.shippingMethod" value="home_delivery" class="mr-2" data-testid="shipping-home-delivery" />
...
<input type="radio" v-model="form.shippingMethod" value="convenience_store" class="mr-2" data-testid="shipping-convenience-store" />
...
<input type="checkbox" v-model="form.isRemoteArea" class="mr-2" data-testid="shipping-remote-area" />
...
<input type="checkbox" v-model="form.isRushDelivery" class="mr-2" data-testid="shipping-rush-delivery" />
```
送出按鈕（`@click="submitOrder"`）加上 `data-testid="checkout-submit"`。同時為收件人姓名/Email/地址三個既有 `<input>` 加上 `data-testid="recipient-name"`／`"recipient-email"`／`"recipient-address"`。

- [x] **Step 4: 修改 `views/pages/order-detail.ejs`**

找到顯示 `statusMap[order.status]?.label` 的 `<span>`，加上 `data-testid="order-status"`。

- [x] **Step 5: 手動驗證頁面仍正常運作**

```bash
npm run start &
sleep 2
curl -s http://localhost:3001/login | grep -c "data-testid"
curl -s http://localhost:3001/ | grep -c "data-testid"
```
Expected: 兩個指令皆印出大於 0 的數字，代表 `data-testid` 屬性確實被伺服器端渲染輸出到 HTML（因為是 EJS 靜態屬性，非 Vue 動態插入，curl 純文字即可看到）。手動確認後終止背景伺服器（`kill %1` 或依環境慣例）。

- [x] **Step 6: 執行全套既有測試確認未破壞**

```bash
rm -f database.sqlite database.sqlite-wal database.sqlite-shm
npm test
```
Expected: 12 個測試檔全數 PASS（純新增 HTML 屬性，不影響任何 API 行為）。

- [x] **Step 7: Commit**

```bash
git add views/pages/login.ejs views/pages/index.ejs views/pages/checkout.ejs views/pages/order-detail.ejs
git commit -m "$(cat <<'EOF'
feat: 前端模板補上 data-testid 屬性供 E2E 測試穩定選取

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 探索真實綠界／土地銀行付款流程（拋棄式，不納入版控）

**Files:**
- Create（scratchpad，不 commit）: 探索用腳本與截圖，放在 Claude 工作階段的 scratchpad 目錄，不寫入專案目錄

**Interfaces:**
- Produces: 一份「發現記錄」（純文字，記在執行者自己的筆記/ledger 中，不是專案檔案），內容包含：綠界付款方式選擇頁的實際按鈕文字/選擇器、選擇銀行後的頁面結構、土地銀行測試頁的表單與 Save 按鈕選擇器、綠界顯示付款成功的頁面特徵、返回商店按鈕的選擇器。Task 7 消費這份發現記錄撰寫正式 spec。

此 Task 性質為**探索**，不是「寫測試→失敗→實作→通過」的標準 TDD 循環，因為在真正看到綠界/土地銀行頁面之前，沒有人知道正確的選擇器是什麼。執行者必須實際跑過一次流程並記錄真實觀察，禁止憑空編造選擇器。

- [x] **Step 1: 確認伺服器已啟動且有可用測試訂單**

```bash
npm run start &
sleep 2
curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"email":"admin@hexschool.com","password":"12345678"}' | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).data.token))"
```
記下印出的 token，供下一步使用。

- [x] **Step 2: 用 API 直接建立一筆待付款訂單（略過 UI，節省探索時間）**

```bash
# 以上一步的 token 取代 <TOKEN>
curl -s http://localhost:3001/api/products | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).data.products[0].id))"
# 記下商品 id，取代 <PRODUCT_ID>
curl -s -X POST http://localhost:3001/api/cart -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -d '{"productId":"<PRODUCT_ID>","quantity":1}'
curl -s -X POST http://localhost:3001/api/orders -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -d '{"recipientName":"探索測試","recipientEmail":"explore@example.com","recipientAddress":"台北市","shippingMethod":"home_delivery"}'
```
記下回應中的訂單 `id`，取代下一步的 `<ORDER_ID>`。

- [x] **Step 3: 寫拋棄式 Playwright 探索腳本，導向綠界付款頁並逐步截圖**

在 Claude 工作階段的 scratchpad 目錄（**不是**專案目錄）建立 `explore-ecpay.spec.js`：

```js
const { test } = require('@playwright/test');

test('explore ecpay staging flow', async ({ page }) => {
  await page.goto('http://localhost:3001/ecpay/payment/<ORDER_ID>');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'SCRATCHPAD_DIR/01-ecpay-landing.png', fullPage: true });

  // 印出目前頁面的可見文字與所有按鈕/連結，協助辨識真實選擇器
  const buttons = await page.locator('button, a, input[type=submit], input[type=image]').allTextContents();
  console.log('BUTTONS/LINKS:', JSON.stringify(buttons));
  console.log('URL:', page.url());
});
```

以 `dangerouslyDisableSandbox` 執行（因需連到 `payment-stage.ecpay.com.tw` 外部網域，且需要用到的土地銀行網域在探索前未知，執行時依 `<sandbox_violations>` 訊息把實際被擋的網域逐一加入該次指令的 `allowed_domains`）：

```bash
npx playwright test SCRATCHPAD_DIR/explore-ecpay.spec.js --config=playwright.config.js
```

- [x] **Step 4: 讀取截圖，辨識「網路ATM」選項的真實選擇器，更新探索腳本繼續往下一步**

用 Read 工具讀取 `SCRATCHPAD_DIR/01-ecpay-landing.png`，肉眼確認頁面內容與 Step 3 印出的 `BUTTONS/LINKS` 清單，找出「網路ATM」對應的真實文字或元素。在探索腳本追加對應的 `page.click(...)` 或 `page.getByText(...).click()`，重新執行，重複「執行 → 讀取新截圖 → 追加下一步選擇器」直到完整走完：選網路ATM → 選台灣土地銀行 → 點擊前往付款 → （若彈出提示視窗）關閉 → 土地銀行頁面點擊 Save → 等待綠界顯示付款成功 → 點擊返回商店。每一步都截圖存到 `SCRATCHPAD_DIR/NN-描述.png`。

- [x] **Step 5: 確認最終導回商店後訂單狀態**

流程跑完後，用 API 直接確認：
```bash
curl -s http://localhost:3001/api/orders/<ORDER_ID> -H "Authorization: Bearer <TOKEN>" | node -e "process.stdin.once('data', d => console.log(JSON.parse(d).data.status))"
```
Expected: 印出 `paid`。若不是，代表探索過程中某一步選錯了選項（例如選到會導致付款失敗的分支），回頭檢查 Step 4 截圖，修正腳本重跑。

- [x] **Step 6: 記錄發現**

把 Step 3～5 過程中確認有效的完整選擇器序列與網域清單（例如土地銀行的實際網域名稱），整理成清單，供 Task 7 撰寫正式 spec 時直接使用。此清單只需存在於執行者的工作記錄（例如本計畫的 ledger 或下一個 Task 的 brief 說明），不建立任何專案內檔案，探索腳本與截圖執行完畢後留在 scratchpad 即可，不需清理（scratchpad 本來就不納入版控）。

- [x] **Step 7: 無需 commit**（本 Task 不產生任何專案內變更）

---

### Task 7: 正式 E2E Spec：登入到綠界付款成功

**Files:**
- Create: `tests/e2e/checkout-ecpay.spec.js`
- Delete: `tests/e2e/_smoke.spec.js`（其驗證目的已被本檔案涵蓋）

**Interfaces:**
- Consumes: Task 5 的 `data-testid` 屬性名稱、Task 6 探索得到的綠界/土地銀行真實選擇器與網域。

- [x] **Step 1: 刪除 smoke spec，建立正式 spec**

```bash
rm tests/e2e/_smoke.spec.js
```

建立 `tests/e2e/checkout-ecpay.spec.js`，本地部分（登入到送出訂單）的選擇器已知、可直接寫出：

```js
const { test, expect } = require('@playwright/test');

test('full checkout flow: login -> add to cart -> checkout -> ECPay payment -> paid', async ({ page, request }) => {
  test.setTimeout(120000);

  // 1. 登入花卉電商
  await page.goto('/login');
  await page.getByTestId('login-email').fill('admin@hexschool.com');
  await page.getByTestId('login-password').fill('12345678');
  await page.getByTestId('login-submit').click();
  await page.waitForURL('**/');

  // 2. 選擇商品並加入購物車
  await page.getByTestId('add-to-cart').first().click();

  // 3. 進入結帳頁面
  await page.goto('/checkout');

  // 4. 填寫配送方式與結帳資料
  await page.getByTestId('recipient-name').fill('E2E 測試收件人');
  await page.getByTestId('recipient-email').fill('e2e-test@example.com');
  await page.getByTestId('recipient-address').fill('台北市 E2E 測試路 1 號');
  await page.getByTestId('shipping-home-delivery').check();

  // 5. 建立訂單（送出後頁面會導向 /ecpay/payment/:orderId 並自動送出表單至綠界）
  await page.getByTestId('checkout-submit').click();
  await page.waitForURL('**/payment-stage.ecpay.com.tw/**', { timeout: 30000 });

  // === 以下步驟依 Task 6 探索結果實際填入 ===
  // 6. 前往綠界測試環境（上一步 waitForURL 已確認抵達）
  // 7. 選擇「網路 ATM」
  // 8. 選擇「台灣土地銀行」
  // 9. 點擊「前往付款」
  // 10. 關閉提示視窗
  // 11. 在土地銀行測試頁面點擊 Save
  // 12. 等待綠界顯示付款成功
  // 13. 點擊「返回商店」

  // 14. 驗證訂單顯示「已付款」
  await expect(page.getByTestId('order-status')).toHaveText('已付款');

  // 15. 驗證訂單狀態為 paid（不只看畫面文字，直接打 API 確認底層狀態）
  const orderId = new URL(page.url()).pathname.split('/').pop();
  const cookies = await page.context().cookies();
  const apiRes = await page.evaluate(async (id) => {
    const token = localStorage.getItem('token');
    const res = await fetch('/api/orders/' + id, { headers: { Authorization: 'Bearer ' + token } });
    return res.json();
  }, orderId);
  expect(apiRes.data.status).toBe('paid');

  // 16. 需要有付款，並返回站點後的成功截圖
  await page.screenshot({ path: `test-results/e2e-payment-success-${Date.now()}.png`, fullPage: true });
});
```

**執行者注意**：第 6～13 步（`=== 以下步驟依 Task 6 探索結果實際填入 ===` 區塊）在動手實作本 Task 時，必須用 Task 6 實際探索得到的真實選擇器取代，禁止照抄上面骨架直接視為完成——上面骨架只包含本地部分（步驟 1～5、14～16）是可直接使用的最終程式碼，中間綠界/土地銀行的操作步驟**必須**依 Task 6 的發現記錄補上真實的 `page.click(...)` / `page.getByText(...)` / `page.frameLocator(...)`（若土地銀行頁面是 iframe，需要用 `frameLocator`）等呼叫，並在每一步之間視需要加上 `page.waitForLoadState()` 或明確的等待條件。

- [x] **Step 2: 執行測試**

```bash
npm run start &
sleep 2
npm run test:e2e
```
Expected: PASS。若失敗，依 `playwright-report/` 的 trace 與截圖檢查是哪一步選擇器不對，回到 Task 6 的探索腳本重新確認該步驟。

- [x] **Step 3: 確認成功截圖確實產生**

```bash
ls test-results/e2e-payment-success-*.png
```
Expected: 至少存在一個檔案。

- [x] **Step 4: Commit**（只 commit 測試程式碼，不 commit 截圖／報告——`.gitignore` 已在 Task 4 排除 `test-results/`）

```bash
git add tests/e2e/checkout-ecpay.spec.js
git rm tests/e2e/_smoke.spec.js
git commit -m "$(cat <<'EOF'
test: 新增登入到綠界付款成功的完整 E2E 測試

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Postman 變數改名（`bearerToken` → `token`）與新增 `sessionId`

**Files:**
- Modify: `src/postman/generator.js`
- Modify: `postman/environment.json`
- Modify: `tests/postman.generator.test.js`

**Interfaces:**
- Produces: `generateCollection()` 產出的 collection 中，所有 `request.auth.bearer[].value` 皆為 `{{token}}`（非 `{{bearerToken}}`），登入/註冊 test script 寫入 `pm.environment.set('token', ...)`。

- [x] **Step 1: 修改測試（先改測試，符合現有專案對這個檔案的測試風格）**

`tests/postman.generator.test.js` 中所有 `bearerToken` 字樣改為 `token`：
- `pm.environment.set('bearerToken'` → `pm.environment.set('token'`
- `.find((b) => b.key === 'token').value).toBe('{{bearerToken}}')` → `.toBe('{{token}}')`

- [x] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/postman.generator.test.js
```
Expected: FAIL（目前程式碼仍產出 `bearerToken`，測試期待 `token`）。

- [x] **Step 3: 修改 `src/postman/generator.js`**

在 `TOKEN_CAPTURE_SCRIPT` 常數中，把：
```js
"    pm.environment.set('bearerToken', body.data.token);",
```
改為：
```js
"    pm.environment.set('token', body.data.token);",
```

新增一個遞迴函式，將 collection 中所有請求的 bearer 變數名稱由 `bearerToken` 改為 `token`：
```js
function renameBearerVariable(items) {
  for (const it of items) {
    if (it.item) {
      renameBearerVariable(it.item);
    } else if (it.request && it.request.auth && it.request.auth.type === 'bearer') {
      it.request.auth.bearer = it.request.auth.bearer.map((entry) =>
        entry.key === 'token' && entry.value === '{{bearerToken}}'
          ? { ...entry, value: '{{token}}' }
          : entry
      );
    }
  }
}
```

在 `generateCollection()` 函式內，於 `attachTokenCapture(collection);` 之後加入：
```js
  renameBearerVariable(collection.item);
```

- [x] **Step 4: 執行測試，確認通過**

```bash
npx vitest run tests/postman.generator.test.js
```
Expected: PASS（5 個 it 全數通過）。

- [x] **Step 5: 修改 `postman/environment.json`**

把 `bearerToken` 那筆變數的 `key` 改為 `token`，並新增一筆 `sessionId`：
```json
{
  "id": "a7cc1846-4ea3-48ac-9f30-209ce9d9ffb4",
  "name": "花卉電商 API - Local",
  "values": [
    { "key": "baseUrl", "value": "http://localhost:3001", "type": "default", "enabled": true },
    { "key": "adminEmail", "value": "admin@hexschool.com", "type": "default", "enabled": true },
    { "key": "adminPassword", "value": "12345678", "type": "secret", "enabled": true },
    { "key": "token", "value": "", "type": "secret", "enabled": true },
    { "key": "sessionId", "value": "", "type": "default", "enabled": true }
  ],
  "_postman_variable_scope": "environment"
}
```

- [x] **Step 6: 重新產生 collection 並人工確認**

```bash
npm run openapi
npm run postman
node -e "
const c = require('./postman/collection.json');
function find(items) { for (const it of items) { if (it.item) { const r = find(it.item); if (r) return r; } else if (it.request && it.request.auth && it.request.auth.type === 'bearer') return it; } }
const item = find(c.item);
console.log(JSON.stringify(item.request.auth));
"
```
Expected: 印出的 `bearer` 陣列中 `value` 為 `{{token}}`，不是 `{{bearerToken}}`。

- [x] **Step 7: Commit**

```bash
git add src/postman/generator.js postman/environment.json tests/postman.generator.test.js
git commit -m "$(cat <<'EOF'
fix: Postman 變數由 bearerToken 統一改名為 token，新增 sessionId 變數

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

（此步驟先不 `git add postman/collection.json`——該檔案將於 Task 9 移出版控。）

---

### Task 9: `postman/collection.json` 移出版控

**Files:**
- Modify: `.gitignore`
- Delete（僅從 git 追蹤移除，保留本機檔案）: `postman/collection.json`

**Interfaces:** 無。

- [x] **Step 1: 更新 `.gitignore`**

加入：
```
postman/collection.json
```

- [x] **Step 2: 從 git 追蹤移除但保留本機檔案**

```bash
git rm --cached postman/collection.json
```

- [x] **Step 3: 確認檔案仍存在於本機**

```bash
ls postman/collection.json
git status --short postman/
```
Expected: `ls` 顯示檔案仍存在；`git status` 顯示 `postman/collection.json` 不再是已追蹤或待加入狀態（因已被 `.gitignore`）。

- [x] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore: postman/collection.json 移出版控，改為執行 npm run postman 隨時產生

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: 文件同步與最終驗證

**Files:**
- Modify: `docs/README.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/CHANGELOG.md`
- Move: `docs/plans/2026-09-27-integration-e2e-postman.md` → `docs/plans/archive/2026-09-27-integration-e2e-postman.md`

**Interfaces:** 無（純文件更新與歸檔）。

- [x] **Step 1: 更新 `docs/README.md` 常用指令表**

在既有 `npm run test`／`npm run test:unit` 等列之後新增：
```
| `npm run test:integration` | 執行 Integration Test（獨立記憶體資料庫） |
| `npm run test:e2e` | 執行 Playwright E2E 測試（需先手動 `npm run start`） |
```

- [x] **Step 2: 更新 `docs/TESTING.md`**

新增一節說明 Integration Test 與 E2E Test：
```markdown
## Integration Test

`npm run test:integration` 執行 `tests/integration/**` 下的測試，使用 `:memory:` SQLite（透過 `DATABASE_PATH` 環境變數注入），完全不觸碰正式 `database.sqlite`，每次執行皆為全新的空白資料庫。

## E2E Test

`npm run test:e2e` 使用 Playwright，測試前須先手動執行 `npm run start` 啟動伺服器（測試本身不會自動啟動），對 `http://localhost:3001` 進行真實瀏覽器操作，涵蓋登入、加入購物車、結帳、綠界付款（網路ATM／土地銀行測試環境）到訂單狀態確認為 `paid` 的完整流程。因涉及第三方頁面（綠界／土地銀行測試環境），其 DOM 結構不受本專案控制，未來對方介面異動可能導致測試失效，需視情況更新 `tests/e2e/checkout-ecpay.spec.js` 的選擇器。
```

- [x] **Step 3: 更新 `docs/CHANGELOG.md`**

在 `## [Unreleased]` 的 `### Added` 小節最前面加入：
```
- 新增 Integration Test（`tests/integration/`，`npm run test:integration`）：獨立記憶體 SQLite，驗證訂單建立完整資料寫入、運費計算、庫存扣除、購物車清空與失敗情境不留髒資料
- 新增 E2E Test（Playwright，`tests/e2e/`，`npm run test:e2e`）：涵蓋登入到綠界付款成功的完整流程
- Postman 變數 `bearerToken` 統一改名為 `token`，新增 `sessionId` 變數；`postman/collection.json` 移出版控，改為執行 `npm run postman` 產生
```

- [x] **Step 4: 執行完整驗證**

```bash
rm -f database.sqlite database.sqlite-wal database.sqlite-shm
npm run test
npm run test:unit
npm run test:integration
npm run openapi
npm run postman
git status --short
```
Expected: `test`／`test:unit`／`test:integration` 皆全數 PASS；`openapi`／`postman` 皆成功產生；`git status` 除本步驟即將 commit 的文件變更外，不應出現 `postman/collection.json`（已在 Task 9 被 gitignore）。`test:e2e` 因需要手動啟動的伺服器與真實綠界流程，不在此自動化驗證範圍內，由 Task 7 的驗證步驟涵蓋。

- [x] **Step 5: 歸檔計畫檔並 Commit**

```bash
mkdir -p docs/plans/archive
git mv docs/plans/2026-09-27-integration-e2e-postman.md docs/plans/archive/2026-09-27-integration-e2e-postman.md
git add docs/README.md docs/TESTING.md docs/CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: 同步 Integration/E2E/Postman 相關文件並歸檔計畫

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
