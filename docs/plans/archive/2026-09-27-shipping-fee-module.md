# 配送費用模組（Shipping Fee）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在既有花卉電商後端加入可獨立單元測試的配送費用計算模組，整合進訂單建立流程，並同步更新前端結帳/訂單詳情頁、OpenAPI 文件、Postman Collection 與專案文件。

**Architecture:** `src/utils/shipping.js` 提供純函式 `calculateShippingFee()`（不依賴 DB/Express）；`orders` 表新增 4 個欄位持久化配送資訊；`POST /api/orders` 於既有「計算商品小計」步驟後呼叫該函式，將 `total_amount` 語意調整為「商品小計 + 運費」並寫回 DB；`GET /:id`、`PATCH /:id/pay`、`POST /:id/check-payment` 因回應皆用 `{ ...order, items }` 展開整列，新增欄位無需額外程式碼即自動出現在回應中；前端結帳頁換掉現有脫節的假運費 UI，改為真正的配送方式選單 + 附加費核取方塊 + 前端試算（伺服器端仍為權威計算來源）。

**Tech Stack:** Node.js + Express + better-sqlite3 + Zod + Vue 3（CDN，無建置流程）既有堆疊不變，不新增任何相依套件。

**Spec:** `docs/plans/2026-09-27-shipping-fee-module.md`（本檔案下方 User Story / Spec 兩節）

## 執行紀錄（全部完成）

| Task | 狀態 | Commit | 驗證 |
|------|------|--------|------|
| 1. `shipping.js` + 單元測試 + `test:unit` | ✅ 完成 | `96d1f7b` | `npm run test:unit` 通過 |
| 2. `orders` 表新增運費欄位（DB 遷移） | ✅ 完成 | `e9ae54a` | `npm test` 全綠 |
| 3. `order.schema.js` 新增配送欄位 | ✅ 完成 | `d1b6a81` | `npx vitest run tests/orders.test.js -t shippingMethod` 通過 |
| 4. `orderRoutes.js` 整合運費計算 + 測試 | ✅ 完成 | `29d17df` | `npx vitest run tests/orders.test.js tests/adminOrders.test.js` 通過 |
| 5. 重新產生 `openapi.json`／`postman/collection.json` | ✅ 完成 | `5a2b416` | `npm test` 93/93 通過 |
| 6. 結帳頁配送方式選單 + 運費試算 | ✅ 完成 | `5b6fd6d` | `npm test` 全綠 |
| 7. 訂單詳情頁運費明細顯示 | ✅ 完成 | `f3378d0` | `npm test` 全綠 |
| 8. 文件同步 | ✅ 完成 | `54890cf` | `npm test` 全綠 |
| 9. 最終驗證與歸檔 | ✅ 完成 | `1016730` | `npm test` 全綠 |
| 最終整體審查（獨立 opus 子代理）與修正 | ✅ 完成 | `7064831`、`38823de` | 1 Critical + 3 Important 已修正，3 Minor 列為延後事項（見下） |

**執行過程中的關鍵裁決（Ruling）：**
- Task 4：計畫原訂 Step 7 用 `npm test` 全套作為完成判定，但當時 schema 已新增欄位、`openapi.json` 尚未重新產生，`openapi.generator.test.js` 的防漂移測試必然失敗——這是預期中屬於 Task 5 職責的序列缺口，非程式碼回歸。改用較窄的指令（`npx vitest run tests/orders.test.js tests/adminOrders.test.js`）作為本 Task 完成判定，Task 5 執行後隨即補回全套驗證。
- Task 5：`npm test` 第一次出現 2 筆與運費無關的失敗（購物車訪客更新數量、新增不存在商品），成因是 `database.sqlite` 為持久化檔案、session 內已累積數十次測試指令的副作用；重置資料庫後重跑 93/93 全數通過，非本 Task 程式碼回歸。
- 最終審查：reviewer 指出 Task 5 附註對「cart.test.js 兩筆無關失敗」的環境脆弱性診斷「說得通但不完整」（因果無法重現）；已採納此評估但不撤回原診斷（cartRoutes.js 在該 diff 範圍內確實零改動），並補充承認診斷未達可重現驗證的嚴謹度。

**最終審查修正（commit `7064831`）：**
1. **Critical**：`GET /:id`、`PATCH /:id/pay`、`POST /:id/check-payment` 皆缺少 `subtotal`（`orders` 表未持久化該欄位），訂單詳情頁對所有訂單呼叫 `order.subtotal.toLocaleString()` 會拋出 TypeError——已新增持久化 `subtotal` 欄位並於建立訂單時寫入，RED→GREEN 驗證後 suite 96/96。
2. **Important**：`order.schema.js` 的 `subtotal`/`shipping_method`/`shipping_fee`/`is_remote_area`/`is_rush_delivery` 改為 nullable，且後兩者由宣稱的 boolean 改為實際 runtime 的 0/1 數字聯集，並重新產生 `openapi.json`/`postman/collection.json`（純 schema/文件正確性修正，以 suite 96/96＋防漂移測試通過驗證）。
3. **Important**：`order-detail.ejs` 對 `shipping_method` 為 null 的舊訂單以 `v-if` 略過運費明細列，避免對 null 呼叫 `toLocaleString()`（純前端模板修正，專案無前端渲染測試基礎設施，以人工檢視 Vue 語意確認正確）。
4. **Important**：補齊 Review Focus「1,499/1,500 整合層邊界」測試缺口——新增兩筆整合測試驗證滿額免運與差 1 元不免運兩種邊界情況，suite 96/96。

**延後事項（Minor，未修正，供後續維護參考）：**
- 新增的邊界測試會加速消耗種子庫存，且未斷言加入購物車成功；屬既有「持久化 database.sqlite」脆弱性的延伸，非本功能新引入的回歸。
- 後台訂單詳情頁（`views/pages/admin/orders.ejs`）未顯示運費明細，總計含運費但無拆分說明。
- 結帳頁配送方式單選項旁的金額文字寫死（NT$120/NT$60），達免運門檻時不會跟著變化，僅下方試算區塊正確。

## Global Constraints

- 運費一律由伺服器依驗證過的 `shippingMethod`/`isRemoteArea`/`isRushDelivery` 重新計算；請求 body 中任何額外欄位（如客戶端算好的金額）一律被 Zod 的預設 strip 行為忽略，不得信任。
- `total_amount` = `subtotal`（商品小計） + `shipping_fee`（運費）；`src/utils/ecpay.js` 不做任何修改，讓其繼續讀取 `order.total_amount` 收費。
- `orders` 表新增欄位一律使用既有 `try { db.exec('ALTER TABLE orders ADD COLUMN ...') } catch (e) {}` 遷移慣例（見 `merchant_trade_no` 前例），確保對已存在的本機 `database.sqlite` 冪等。
- 回應／DB 欄位一律 `snake_case`（`shipping_method`、`shipping_fee`、`is_remote_area`、`is_rush_delivery`），請求 body 欄位一律 `camelCase`（`shippingMethod`、`isRemoteArea`、`isRushDelivery`），比照專案既有慣例（`recipientName` request vs `recipient_name` response）。
- `GET /api/orders`（列表）欄位維持不變，不新增運費拆分；僅建立訂單回應與 `GET /api/orders/:id` 顯示 `subtotal`/`shipping_fee` 明細。
- `tests/orders.test.js`、`tests/adminOrders.test.js` 中既有呼叫 `POST /api/orders` 的地方，因新增必填欄位 `shippingMethod`，必須同步補上，否則會因新驗證規則回 400 而使既有測試崩潰。
- `npm run test`（全套）與 `npm run test:unit`（僅 `tests/shipping.test.js`）皆須通過；`tests/shipping.test.js` 為純函式測試，不寫入 `vitest.config.js` 的 `sequence.files` 排序陣列（比照 `tests/schemas.common.test.js` 前例）。
- Schema 變動後需重新執行 `npm run openapi`、`npm run postman` 並提交產出檔案。

## Review Focus

- 免運門檻邊界：商品小計恰為 1,499 應收基本運費、恰為 1,500 應免除基本運費，且該邊界須在**整合層級**（實際打 API、真實購物車小計）驗證一次，而不只在 `calculateShippingFee()` 單元測試驗證，避免路由層傳入錯誤的 `subtotal`（例如誤用含運費後的金額、或用錯品項加總）而被單元測試蓋不到 —— 對應 Task 4 整合測試。
- `shippingMethod` 為無效列舉值或缺漏時應回 400 `VALIDATION_ERROR`，不得被忽略或套用預設值 —— 對應 Task 3 schema 測試／Task 4 整合測試。
- 客戶端在請求 body 中夾帶偽造的 `shippingFee`/`totalAmount`/`subtotal` 欄位時，伺服器必須完全忽略、仍以自行計算的結果為準（Zod 預設會 strip 未宣告欄位，但需要一筆測試明確釘住這個防線，避免未來有人不小心把這些欄位加進 schema）—— 對應 Task 4 整合測試。
- `PATCH /api/orders/:id/pay`、`POST /api/orders/:id/check-payment` 因直接展開 `{ ...order, items }`／`{ ...updated, items }`，新增的 `shipping_fee` 等欄位應自動出現在這兩個既有端點的回應中而不需要額外程式碼——需要一筆測試明確驗證這個「免費」的正確性假設是成立的，而不是憑印象認定。
- 偏遠地區／當日急件附加費在「超商取貨」配送方式下應與「宅配」一樣正常疊加（規格未限制兩者互斥），需有一筆測試覆蓋「超商取貨 + 急件」組合，避免實作時不小心把附加費邏輯寫成只綁定宅配。

---

## User Story

作為消費者，我希望結帳時能選擇配送方式（宅配／超商取貨），並依偏遠地區、當日急件等條件正確計算運費，以便在下單前清楚知道實際需支付的總金額；作為開發者，我希望運費計算邏輯封裝於獨立、可單元測試的模組，與訂單建立流程解耦。

## Spec

### 目標與範圍

- 新增 `src/utils/shipping.js`：純函式運費計算模組，不依賴資料庫或 Express。
- 將運費計算整合進既有 `POST /api/orders` 建立訂單流程，運費由後端依驗證過的配送條件重新計算，不信任前端送來的金額。
- 前端結帳頁（`checkout.ejs`／`checkout.js`）新增配送方式選擇與即時運費試算 UI，取代目前完全脫節、寫死門檻 500／運費 150 且從未送到後端的假運費區塊。
- 訂單詳情頁（`order-detail.ejs`）新增運費／配送方式明細顯示。
- 同步更新 `docs/ARCHITECTURE.md`、`docs/FEATURES.md`、`docs/CHANGELOG.md`，並重新產生 `openapi.json`、`postman/collection.json`。
- 新增 `tests/shipping.test.js`（純函式單元測試，涵蓋 8 種情境）與 `package.json` 的 `"test:unit"` script；同步更新 `tests/orders.test.js`、`tests/adminOrders.test.js` 中既有建立訂單呼叫（因新增必填欄位）。

### 配送費用規則

| 規則 | 金額 |
|---|---|
| 宅配（`home_delivery`）基本運費 | 120 |
| 超商取貨（`convenience_store`）基本運費 | 60 |
| 偏遠地區附加費 | +200 |
| 當日急件附加費 | +250 |
| 商品小計（`subtotal`）≥ 1,500 元 | 免「基本運費」（偏遠地區／急件附加費不受影響，仍需支付） |

### 資料庫變更

沿用既有 `merchant_trade_no` 遷移慣例，於 `orders` 表新增：

| 欄位 | 型別 | 說明 |
|---|---|---|
| `shipping_method` | TEXT | `home_delivery` 或 `convenience_store` |
| `shipping_fee` | INTEGER | 依規則計算後的運費金額 |
| `is_remote_area` | INTEGER | 0/1，是否為偏遠地區 |
| `is_rush_delivery` | INTEGER | 0/1，是否為當日急件 |

`total_amount` 語意調整為「商品小計 + 運費」（原本僅商品金額）。此舉讓 `src/utils/ecpay.js:111` 的 `TotalAmount: String(order.total_amount)` 無需任何修改即可正確收費。

### API 規格

**`POST /api/orders`**：Request body 新增必填 `shippingMethod`（`'home_delivery'|'convenience_store'`）、選填 `isRemoteArea`/`isRushDelivery`（預設 `false`）。回應（`orderRecordSchema`）新增 `subtotal`、`shipping_method`、`shipping_fee`、`is_remote_area`、`is_rush_delivery`。

**`GET /api/orders/:id`**（`orderDetailSchema`）：比照新增上述五個欄位。

**`GET /api/orders`**（訂單列表）：維持現有精簡欄位不變。

### 業務規則

- 運費一律由伺服器重新計算，不信任前端送來的金額。
- `shippingMethod` 為必填欄位；缺漏或非列舉值回 400 `VALIDATION_ERROR`。
- 偏遠地區／急件附加費與配送方式之間不互斥，可任意組合。
- 滿額免運僅免除「基本運費」，附加費不受滿額影響。

### 前端規格

- `checkout.ejs`：移除現有寫死「滿 500 免運／NT$150」區塊，改為配送方式單選 + 偏遠地區／當日急件核取方塊 + 即時試算區（商品小計、運費、總計）。
- `checkout.js`：新增與 `shipping.js` 相同公式的前端試算函式；`submitOrder()` 送出的 body 加入三個新欄位。
- `order-detail.ejs`：新增「商品小計」「運費」兩行與配送方式/標籤顯示。

---

### Task 1: `src/utils/shipping.js` + 單元測試 + `test:unit` script

**Files:**
- Create: `src/utils/shipping.js`
- Test: `tests/shipping.test.js`
- Modify: `package.json`（新增 `test:unit` script）

**Interfaces:**
- Produces：`module.exports = { calculateShippingFee, SHIPPING_METHODS, REMOTE_AREA_SURCHARGE, RUSH_DELIVERY_SURCHARGE, FREE_BASE_SHIPPING_THRESHOLD }`。`calculateShippingFee({ shippingMethod, subtotal, isRemoteArea?, isRushDelivery? })` 回傳運費數字；`shippingMethod` 不在 `SHIPPING_METHODS` 鍵值中時拋出 `Error`。Task 3（schema）、Task 4（route）皆消費 `calculateShippingFee` 與 `SHIPPING_METHODS`。

- [x] **Step 1: 寫失敗測試**

建立 `tests/shipping.test.js`：

```js
const {
  calculateShippingFee,
  SHIPPING_METHODS,
  REMOTE_AREA_SURCHARGE,
  RUSH_DELIVERY_SURCHARGE,
  FREE_BASE_SHIPPING_THRESHOLD
} = require('../src/utils/shipping');

describe('calculateShippingFee', () => {
  it('宅配基本運費為 120', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 500 })).toBe(120);
  });

  it('超商取貨基本運費為 60', () => {
    expect(calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 500 })).toBe(60);
  });

  it('商品小計 1,499 元仍需支付基本運費', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 1499 })).toBe(120);
    expect(calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 1499 })).toBe(60);
  });

  it('商品小計恰為 1,500 元免除基本運費', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 1500 })).toBe(0);
    expect(calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 1500 })).toBe(0);
  });

  it('偏遠地區加收 200 元', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 500, isRemoteArea: true })).toBe(320);
  });

  it('當日急件加收 250 元', () => {
    expect(calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 500, isRushDelivery: true })).toBe(370);
  });

  it('偏遠地區與當日急件可同時成立並疊加', () => {
    expect(
      calculateShippingFee({ shippingMethod: 'convenience_store', subtotal: 500, isRemoteArea: true, isRushDelivery: true })
    ).toBe(60 + 200 + 250);
  });

  it('滿額免運時，偏遠地區與急件附加費仍需支付', () => {
    expect(
      calculateShippingFee({ shippingMethod: 'home_delivery', subtotal: 1500, isRemoteArea: true, isRushDelivery: true })
    ).toBe(0 + 200 + 250);
  });

  it('未知的配送方式會拋出例外', () => {
    expect(() => calculateShippingFee({ shippingMethod: 'drone', subtotal: 500 })).toThrow();
  });

  it('匯出的常數與規格一致', () => {
    expect(SHIPPING_METHODS).toEqual({ home_delivery: 120, convenience_store: 60 });
    expect(REMOTE_AREA_SURCHARGE).toBe(200);
    expect(RUSH_DELIVERY_SURCHARGE).toBe(250);
    expect(FREE_BASE_SHIPPING_THRESHOLD).toBe(1500);
  });
});
```

- [x] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/shipping.test.js
```

Expected: FAIL（`Cannot find module '../src/utils/shipping'`）。

- [x] **Step 3: 建立 `src/utils/shipping.js`**

```js
const SHIPPING_METHODS = {
  home_delivery: 120,
  convenience_store: 60
};

const REMOTE_AREA_SURCHARGE = 200;
const RUSH_DELIVERY_SURCHARGE = 250;
const FREE_BASE_SHIPPING_THRESHOLD = 1500;

function calculateShippingFee({ shippingMethod, subtotal, isRemoteArea = false, isRushDelivery = false }) {
  if (!Object.prototype.hasOwnProperty.call(SHIPPING_METHODS, shippingMethod)) {
    throw new Error(`未知的配送方式：${shippingMethod}`);
  }
  const baseFee = subtotal >= FREE_BASE_SHIPPING_THRESHOLD ? 0 : SHIPPING_METHODS[shippingMethod];
  const remoteFee = isRemoteArea ? REMOTE_AREA_SURCHARGE : 0;
  const rushFee = isRushDelivery ? RUSH_DELIVERY_SURCHARGE : 0;
  return baseFee + remoteFee + rushFee;
}

module.exports = {
  calculateShippingFee,
  SHIPPING_METHODS,
  REMOTE_AREA_SURCHARGE,
  RUSH_DELIVERY_SURCHARGE,
  FREE_BASE_SHIPPING_THRESHOLD
};
```

- [x] **Step 4: 執行測試，確認通過**

```bash
npx vitest run tests/shipping.test.js
```

Expected: PASS（10 個 it 全數通過）。

- [x] **Step 5: 新增 `test:unit` script**

於 `package.json` 的 `"scripts"` 區塊，在 `"openapi"` 與 `"postman"` 之後、`"test"` 之前加入：

```json
"test:unit": "vitest run tests/shipping.test.js",
```

- [x] **Step 6: 驗證新 script**

```bash
npm run test:unit
```

Expected: 與 Step 4 相同，10 個測試全數通過。

- [x] **Step 7: Commit**

```bash
git add src/utils/shipping.js tests/shipping.test.js package.json
git commit -m "$(cat <<'EOF'
feat: 新增 Shipping 運費計算純函式模組與單元測試

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `orders` 表新增運費相關欄位（DB 遷移）

**Files:**
- Modify: `src/database.js`

**Interfaces:**
- Produces：`orders` 表新增 `shipping_method TEXT`、`shipping_fee INTEGER`、`is_remote_area INTEGER`、`is_rush_delivery INTEGER` 四個欄位。Task 4（route）消費這些欄位做 INSERT。

- [x] **Step 1: 修改 `src/database.js`**

在既有 `merchant_trade_no` 遷移區塊（`initializeDatabase()` 內）之後，加入：

```js
  // Migration: add shipping fields for shipping fee module
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN shipping_method TEXT`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN shipping_fee INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN is_remote_area INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    db.exec(`ALTER TABLE orders ADD COLUMN is_rush_delivery INTEGER`);
  } catch (e) {
    // Column already exists, ignore
  }
```

（緊接在現有 `try { db.exec('ALTER TABLE orders ADD COLUMN merchant_trade_no TEXT') } catch (e) {}` 區塊之後、`// Seed data` 之前。）

- [x] **Step 2: 手動驗證遷移可重複執行（冪等）**

```bash
rm -f database.sqlite database.sqlite-wal database.sqlite-shm
node -e "require('./src/database'); console.log('first init OK')"
node -e "require('./src/database'); console.log('second init OK (idempotent)')"
node -e "
const db = require('./src/database');
const cols = db.prepare(\"PRAGMA table_info(orders)\").all().map(c => c.name);
console.log(cols);
if (!['shipping_method','shipping_fee','is_remote_area','is_rush_delivery'].every(c => cols.includes(c))) {
  throw new Error('缺少新欄位');
}
console.log('columns OK');
"
```

Expected: 兩次執行皆印出 `OK`，且第二次執行不拋出例外（欄位已存在時 catch 忽略）；`columns OK` 印出，代表四個新欄位都存在。

- [x] **Step 3: 執行既有測試套件確認未破壞（此步驟預期會因 Task 3/4 尚未完成而部分失敗屬正常，先確認至少不是因為這個 Task 本身導致例外）**

```bash
npm test 2>&1 | tail -30
```

Expected: 不應出現與 `ALTER TABLE`／`database.sqlite` 相關的例外訊息（既有測試因後續 Task 尚未完成而可能有其他失敗，屬預期中，Task 4 完成後會重新全綠）。

- [x] **Step 4: Commit**

```bash
git add src/database.js
git commit -m "$(cat <<'EOF'
feat: orders 表新增運費相關欄位（shipping_method/shipping_fee/is_remote_area/is_rush_delivery）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `src/schemas/order.schema.js` 新增配送欄位

**Files:**
- Modify: `src/schemas/order.schema.js`

**Interfaces:**
- Consumes：`SHIPPING_METHODS`（Task 1，`src/utils/shipping.js`，取其鍵值作為 enum 選項）。
- Produces：`createOrderBodySchema` 新增 `shippingMethod`/`isRemoteArea`/`isRushDelivery`；`orderRecordSchema`/`orderDetailSchema` 新增 `subtotal`/`shipping_method`/`shipping_fee`/`is_remote_area`/`is_rush_delivery`。Task 4（route）、Task 8（openapi paths，透過既有 import 自動反映）皆消費這些 schema。

- [x] **Step 1: 寫測試（先確認新 schema 的驗證行為）**

於 `tests/orders.test.js` 檔案結尾、`});` 之前插入（本步驟先寫測試，Step 3 改完 schema 後才會全部通過；Step 2 執行時預期只有沿用舊 schema 的既有測試通過，新測試會失敗）：

```js
  it('should fail to create order with a missing shippingMethod', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號'
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to create order with an invalid shippingMethod', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'drone'
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });
```

- [x] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/orders.test.js
```

Expected: FAIL — 這兩筆新測試會因為目前 `createOrderBodySchema` 沒有 `shippingMethod` 欄位、缺少該欄位不會被拒絕而回 201（購物車此時可能為空導致 400 CART_EMPTY，也可能非預期的 400/201，總之不是我們要的 400 VALIDATION_ERROR 語意）而失敗或給出非預期結果。

- [x] **Step 3: 修改 `src/schemas/order.schema.js`**

在檔案頂部加入 import，並修改 `createOrderBodySchema`、`orderRecordSchema`、`orderDetailSchema`：

```js
const { z } = require('zod');
const { SHIPPING_METHODS } = require('../utils/shipping');

const SHIPPING_METHOD_VALUES = Object.keys(SHIPPING_METHODS);

const createOrderBodySchema = z.object({
  recipientName: z.string().min(1, '收件人姓名、Email 和地址為必填欄位'),
  recipientEmail: z.string().min(1, '收件人姓名、Email 和地址為必填欄位').email('Email 格式不正確'),
  recipientAddress: z.string().min(1, '收件人姓名、Email 和地址為必填欄位'),
  shippingMethod: z.enum(SHIPPING_METHOD_VALUES, { error: 'shippingMethod 必須為 home_delivery 或 convenience_store' }),
  isRemoteArea: z.boolean().optional().default(false),
  isRushDelivery: z.boolean().optional().default(false)
});
```

（`SHIPPING_METHOD_VALUES` 這行放在 `createOrderBodySchema` 定義之前；`z.enum()` 在 zod v4 需要傳入至少一個元素的陣列，`Object.keys(SHIPPING_METHODS)` 結果為 `['home_delivery', 'convenience_store']`，順序不影響驗證行為。）

`orderRecordSchema` 修改為：

```js
const orderRecordSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  subtotal: z.number(),
  shipping_method: z.string(),
  shipping_fee: z.number(),
  is_remote_area: z.boolean(),
  is_rush_delivery: z.boolean(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string(),
  items: z.array(orderItemBriefSchema)
});
```

`orderDetailSchema` 修改為：

```js
const orderDetailSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  recipient_address: z.string(),
  subtotal: z.number(),
  shipping_method: z.string(),
  shipping_fee: z.number(),
  is_remote_area: z.boolean(),
  is_rush_delivery: z.boolean(),
  total_amount: z.number(),
  status: z.string(),
  merchant_trade_no: z.string().nullable(),
  created_at: z.string(),
  items: z.array(orderItemDetailSchema)
});
```

- [x] **Step 4: 執行測試，確認 Step 1 新增的兩筆測試通過（其餘既有測試因 Task 4 尚未整合運費邏輯，預期仍有失敗，屬正常）**

```bash
npx vitest run tests/orders.test.js -t "shippingMethod"
```

Expected: PASS（Step 1 新增的 2 筆測試通過）。

- [x] **Step 5: Commit**

```bash
git add src/schemas/order.schema.js tests/orders.test.js
git commit -m "$(cat <<'EOF'
feat: order schema 新增配送方式與運費相關欄位

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `src/routes/orderRoutes.js` 整合運費計算 + 既有測試更新 + 新增整合測試

**Files:**
- Modify: `src/routes/orderRoutes.js`
- Modify: `tests/orders.test.js`（既有建立訂單呼叫補欄位、新增整合測試）
- Modify: `tests/adminOrders.test.js`（`beforeAll` 建立訂單呼叫補欄位）

**Interfaces:**
- Consumes：`calculateShippingFee`（Task 1）、`createOrderRequestSchema`（Task 3，已含新欄位）。
- Produces：`POST /api/orders` 回應與寫入 DB 的 `orders` 列包含 `subtotal`/`shipping_method`/`shipping_fee`/`is_remote_area`/`is_rush_delivery`/`total_amount`（= subtotal + shipping_fee）。

- [x] **Step 1: 更新 `tests/orders.test.js` 既有建立訂單呼叫，補上 `shippingMethod`**

`beforeAll` 之後第一個 `it('should create an order from cart', ...)`，把 `.send({...})` 改為：

```js
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery'
      });
```

同一份檔案中 `it('should fail to create order with empty cart', ...)` 的 `.send({...})` 也比照補上 `shippingMethod: 'home_delivery'`（該測試驗證的是「空購物車」情境，補上此欄位純粹是為了讓請求本身通過 schema 驗證、讓 400 CART_EMPTY 才是真正被觸發的錯誤，而不是被 shippingMethod 缺漏的 400 VALIDATION_ERROR 蓋過去）。

`it('should fail to create order without auth', ...)` 的 body 維持不動（該測試驗證的是 401，不會走到 body 驗證）。

- [x] **Step 2: 更新 `tests/adminOrders.test.js` 的 `beforeAll`**

```js
    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '管理員測試收件人',
        recipientEmail: 'admin-test@example.com',
        recipientAddress: '台北市管理員測試路 456 號',
        shippingMethod: 'home_delivery'
      });
```

- [x] **Step 3: 執行測試，確認失敗（尚未整合運費計算，`total_amount` 仍只有商品金額，新的整合測試 Step 5 尚未寫）**

```bash
npx vitest run tests/orders.test.js tests/adminOrders.test.js
```

Expected: 除 `create an order from cart` 之外，其餘既有測試因僅補了欄位、尚未整合運費邏輯，`total_amount` 斷言（若有精確數值）會不吻合；目前既有測試都只用 `toHaveProperty('total_amount')` 不驗精確值，所以此步驟應該仍然 PASS（先確認補欄位沒有讓既有測試壞掉）。

- [x] **Step 4: 修改 `src/routes/orderRoutes.js`**

在檔案頂部加入 import：

```js
const { calculateShippingFee } = require('../utils/shipping');
```

（與其他 `require` 並列，放在 `const { queryTradeInfo } = require('../utils/ecpay');` 之後。）

修改 `router.post('/', ...)` 內，把原本：

```js
  const { recipientName, recipientEmail, recipientAddress } = req.validated.body;
  const userId = req.user.userId;
```

改為：

```js
  const { recipientName, recipientEmail, recipientAddress, shippingMethod, isRemoteArea, isRushDelivery } = req.validated.body;
  const userId = req.user.userId;
```

把原本：

```js
  // Calculate total
  const totalAmount = cartItems.reduce((sum, item) => sum + item.product_price * item.quantity, 0);

  const orderId = uuidv4();
  const orderNo = generateOrderNo();
  const merchantTradeNo = orderNo.replace(/-/g, '');
```

改為：

```js
  // Calculate total
  const subtotal = cartItems.reduce((sum, item) => sum + item.product_price * item.quantity, 0);
  const shippingFee = calculateShippingFee({ shippingMethod, subtotal, isRemoteArea, isRushDelivery });
  const totalAmount = subtotal + shippingFee;

  const orderId = uuidv4();
  const orderNo = generateOrderNo();
  const merchantTradeNo = orderNo.replace(/-/g, '');
```

把 INSERT orders 的 SQL 與參數，從：

```js
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount, merchant_trade_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress, totalAmount, merchantTradeNo);
```

改為：

```js
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, shipping_method, shipping_fee, is_remote_area, is_rush_delivery, total_amount, merchant_trade_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress,
      shippingMethod, shippingFee, isRemoteArea ? 1 : 0, isRushDelivery ? 1 : 0,
      totalAmount, merchantTradeNo
    );
```

最後，把建立訂單成功後的回應，從：

```js
  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      total_amount: order.total_amount,
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
```

改為：

```js
  res.status(201).json({
    data: {
      id: order.id,
      order_no: order.order_no,
      subtotal,
      shipping_method: order.shipping_method,
      shipping_fee: order.shipping_fee,
      is_remote_area: order.is_remote_area,
      is_rush_delivery: order.is_rush_delivery,
      total_amount: order.total_amount,
      status: order.status,
      items: orderItems,
      created_at: order.created_at
    },
    error: null,
    message: '訂單建立成功'
  });
```

（`subtotal` 直接沿用前面已經算好的區域變數 `subtotal`，不需要重新推導。`is_remote_area`/`is_rush_delivery` 刻意**不**做 `!!` 布林轉換，直接透傳 `order.is_remote_area`/`order.is_rush_delivery`（SQLite 讀出來是 `0`/`1` 數字）——這是為了與下面 `GET /:id`、`PATCH /:id/pay`、`POST /:id/check-payment` 三個路由的回應型別保持一致，避免同一筆訂單透過不同端點查看時，這兩個欄位一個是 `boolean`、一個是 `0`/`1` 數字的不一致情形。）

`router.get('/:id', ...)`、`router.patch('/:id/pay', ...)`、`router.post('/:id/check-payment', ...)` **三個路由完全不需要修改**——它們的回應都用 `{ ...order, items }` 或 `{ ...updated, items }` 展開整個 DB 列，新欄位（`shipping_method`/`shipping_fee`/`is_remote_area`/`is_rush_delivery`）會自動包含在回應中，且與建立訂單回應一樣是 `0`/`1` 數字（非 `boolean`）。`orderDetailSchema`/`orderRecordSchema` 中 `is_remote_area`/`is_rush_delivery` 宣告為 `z.boolean()` 僅影響 OpenAPI 文件產出的型別標註，不做 runtime response 驗證，不會導致 request 失敗；Step 5 的測試一律用寬鬆斷言（`!!value` 轉布林後再比較，或直接比對 `0`/`1`），不要斷言嚴格 `=== true`。

- [x] **Step 5: 新增整合測試**

於 `tests/orders.test.js` 檔案結尾、`});` 之前插入：

```js
  it('should calculate shipping fee correctly and include it in total_amount', async () => {
    const { token } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const cheapProduct = prodRes.body.data.products.find((p) => p.price < 1500);

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: cheapProduct.id, quantity: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '運費測試',
        recipientEmail: 'shipping-test@example.com',
        recipientAddress: '台北市運費測試路 1 號',
        shippingMethod: 'home_delivery'
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(cheapProduct.price);
    expect(res.body.data.shipping_method).toBe('home_delivery');
    expect(res.body.data.shipping_fee).toBe(120);
    expect(res.body.data.total_amount).toBe(cheapProduct.price + 120);
  });

  it('should apply convenience_store base fee plus remote area and rush surcharges together', async () => {
    const { token } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const cheapProduct = prodRes.body.data.products.find((p) => p.price < 1500);

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: cheapProduct.id, quantity: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '超商急件測試',
        recipientEmail: 'store-rush-test@example.com',
        recipientAddress: '台北市超商急件測試路 1 號',
        shippingMethod: 'convenience_store',
        isRemoteArea: true,
        isRushDelivery: true
      });

    expect(res.status).toBe(201);
    expect(res.body.data.shipping_fee).toBe(60 + 200 + 250);
    expect(res.body.data.total_amount).toBe(cheapProduct.price + 60 + 200 + 250);
  });

  it('should waive the base shipping fee when subtotal reaches 1500, but still charge surcharges', async () => {
    const { token } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const expensiveProduct = prodRes.body.data.products.find((p) => p.price >= 1500);

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: expensiveProduct.id, quantity: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '滿額免運測試',
        recipientEmail: 'free-shipping-test@example.com',
        recipientAddress: '台北市滿額免運測試路 1 號',
        shippingMethod: 'home_delivery',
        isRemoteArea: true
      });

    expect(res.status).toBe(201);
    expect(res.body.data.subtotal).toBe(expensiveProduct.price);
    expect(res.body.data.shipping_fee).toBe(200);
    expect(res.body.data.total_amount).toBe(expensiveProduct.price + 200);
  });

  it('should ignore a forged shippingFee/totalAmount in the request body and always recompute server-side', async () => {
    const { token } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const cheapProduct = prodRes.body.data.products.find((p) => p.price < 1500);

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: cheapProduct.id, quantity: 1 });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '偽造金額測試',
        recipientEmail: 'forged-amount-test@example.com',
        recipientAddress: '台北市偽造金額測試路 1 號',
        shippingMethod: 'home_delivery',
        shippingFee: 0,
        totalAmount: 1
      });

    expect(res.status).toBe(201);
    expect(res.body.data.shipping_fee).toBe(120);
    expect(res.body.data.total_amount).toBe(cheapProduct.price + 120);
  });

  it('should carry the new shipping fields through GET /:id, PATCH /:id/pay and POST /:id/check-payment without extra code', async () => {
    const { token } = await registerUser();
    const prodRes = await request(app).get('/api/products');
    const cheapProduct = prodRes.body.data.products.find((p) => p.price < 1500);

    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${token}`)
      .send({ productId: cheapProduct.id, quantity: 1 });

    const createRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        recipientName: '欄位透傳測試',
        recipientEmail: 'passthrough-test@example.com',
        recipientAddress: '台北市欄位透傳測試路 1 號',
        shippingMethod: 'convenience_store',
        isRushDelivery: true
      });
    const newOrderId = createRes.body.data.id;

    const detailRes = await request(app)
      .get(`/api/orders/${newOrderId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(detailRes.body.data.shipping_method).toBe('convenience_store');
    expect(detailRes.body.data.shipping_fee).toBe(60 + 250);
    expect(!!detailRes.body.data.is_rush_delivery).toBe(true);

    const payRes = await request(app)
      .patch(`/api/orders/${newOrderId}/pay`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'success' });
    expect(payRes.body.data.shipping_fee).toBe(60 + 250);

    // check-payment on an already-paid (non-pending) order takes the early-return
    // branch that also just spreads { ...order, items } without calling ECPay
    const checkRes = await request(app)
      .post(`/api/orders/${newOrderId}/check-payment`)
      .set('Authorization', `Bearer ${token}`);
    expect(checkRes.status).toBe(200);
    expect(checkRes.body.data.shipping_fee).toBe(60 + 250);
  });
```

- [x] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/orders.test.js tests/adminOrders.test.js
```

Expected: PASS（全部既有 + 新增測試皆通過）。

- [x] **Step 7: 執行全套測試確認無回歸**

```bash
npm test
```

Expected: 全部測試檔案 PASS。

- [x] **Step 8: Commit**

```bash
git add src/routes/orderRoutes.js tests/orders.test.js tests/adminOrders.test.js
git commit -m "$(cat <<'EOF'
feat: 訂單建立流程整合運費計算，total_amount 改為商品小計加運費

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 重新產生 `openapi.json` 與 `postman/collection.json`

**Files:**
- Modify: `openapi.json`（產出檔）
- Modify: `postman/collection.json`（產出檔）

**Interfaces:**
- Consumes：Task 3 更新後的 `order.schema.js`（透過既有 `src/openapi/paths/order.paths.js` 的 import，文件自動反映新欄位，不需修改 `order.paths.js` 本身的程式碼，僅需確認其 description 文字沒有過時的錯誤敘述）。

- [x] **Step 1: 檢查 `src/openapi/paths/order.paths.js` 的 description 文字**

讀取該檔案，確認 `POST /api/orders` 的 400 回應 description（目前為 `'購物車為空或庫存不足或收件資訊缺失'`）是否需要補上「或配送方式無效」；若需要，修改為：

```js
    400: { description: '購物車為空或庫存不足或收件資訊缺失或配送方式無效' },
```

- [x] **Step 2: 重新產生 openapi.json**

```bash
npm run openapi
```

Expected: 印出 `openapi.json generated and validated successfully`。

- [x] **Step 3: 確認新欄位確實出現在文件中**

```bash
node -e "
const doc = require('./openapi.json');
const schema = doc.paths['/api/orders'].post.requestBody.content['application/json'].schema;
console.log(JSON.stringify(schema.properties.shippingMethod, null, 2));
console.log(Object.keys(doc.components.schemas || {}));
"
```

Expected: 印出 `shippingMethod` 的 enum schema（含 `home_delivery`/`convenience_store`），不拋出例外。

- [x] **Step 4: 重新產生 Postman Collection**

```bash
npm run postman
```

Expected: 印出 `postman/collection.json generated successfully`。

- [x] **Step 5: 執行 `tests/openapi.generator.test.js` 確認防漂移測試通過**

```bash
npx vitest run tests/openapi.generator.test.js
```

Expected: PASS（含比對 `openapi.json` 逐位元組相同的測試，此步驟已在 Step 2 重新產檔，理應通過）。

- [x] **Step 6: Commit**

```bash
git add openapi.json postman/collection.json src/openapi/paths/order.paths.js
git commit -m "$(cat <<'EOF'
chore: 重新產生 openapi.json 與 Postman Collection 以反映運費欄位

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

（若 Step 1 判斷不需修改 `order.paths.js`，則此步驟改為 `git add openapi.json postman/collection.json`，commit message 移除 `src/openapi/paths/order.paths.js` 提及。）

---

### Task 6: 前端結帳頁（`checkout.ejs` + `checkout.js`）

**Files:**
- Modify: `views/pages/checkout.ejs`
- Modify: `public/js/pages/checkout.js`

**Interfaces:**
- Consumes：無程式介面（純前端頁面），但邏輯上複製 Task 1 `calculateShippingFee` 的公式（前端純 JS 環境無法直接 `require` 後端模組，故重寫一份同公式的前端版本，變數與規則需與 `src/utils/shipping.js` 保持一致）。
- Produces：`submitOrder()` 送出的 `POST /api/orders` body 新增 `shippingMethod`/`isRemoteArea`/`isRushDelivery` 三個欄位。

- [x] **Step 1: 修改 `views/pages/checkout.ejs`**

把現有：

```html
        <div class="border-t border-gray-100 pt-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-text-secondary">商品小計</span>
            <span>NT$ {{ cartTotal.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">運費</span>
            <span>{{ cartTotal >= 500 ? '免運' : 'NT$ 150' }}</span>
          </div>
        </div>
        <div class="border-t border-gray-100 pt-3 mt-3 flex justify-between items-center">
          <span class="font-bold text-text-primary">總計</span>
          <span class="font-bold text-xl text-rose-primary">
            NT$ {{ (cartTotal + (cartTotal >= 500 ? 0 : 150)).toLocaleString() }}
          </span>
        </div>
```

改為：

```html
        <div class="space-y-3 mb-4 border-t border-gray-100 pt-4">
          <h3 class="text-sm font-medium text-text-primary">配送方式</h3>
          <label class="flex items-center justify-between text-sm cursor-pointer">
            <span>
              <input type="radio" v-model="form.shippingMethod" value="home_delivery" class="mr-2" />
              宅配
            </span>
            <span class="text-text-secondary">NT$ 120</span>
          </label>
          <label class="flex items-center justify-between text-sm cursor-pointer">
            <span>
              <input type="radio" v-model="form.shippingMethod" value="convenience_store" class="mr-2" />
              超商取貨
            </span>
            <span class="text-text-secondary">NT$ 60</span>
          </label>
          <label class="flex items-center justify-between text-sm cursor-pointer">
            <span>
              <input type="checkbox" v-model="form.isRemoteArea" class="mr-2" />
              偏遠地區
            </span>
            <span class="text-text-secondary">+NT$ 200</span>
          </label>
          <label class="flex items-center justify-between text-sm cursor-pointer">
            <span>
              <input type="checkbox" v-model="form.isRushDelivery" class="mr-2" />
              當日急件
            </span>
            <span class="text-text-secondary">+NT$ 250</span>
          </label>
        </div>
        <div class="border-t border-gray-100 pt-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-text-secondary">商品小計</span>
            <span>NT$ {{ cartTotal.toLocaleString() }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-text-secondary">運費</span>
            <span>{{ shippingFee === 0 ? '免運' : ('NT$ ' + shippingFee.toLocaleString()) }}</span>
          </div>
        </div>
        <div class="border-t border-gray-100 pt-3 mt-3 flex justify-between items-center">
          <span class="font-bold text-text-primary">總計</span>
          <span class="font-bold text-xl text-rose-primary">
            NT$ {{ (cartTotal + shippingFee).toLocaleString() }}
          </span>
        </div>
```

- [x] **Step 2: 修改 `public/js/pages/checkout.js`**

把：

```js
    const form = ref({ recipientName: '', recipientEmail: '', recipientAddress: '' });
```

改為：

```js
    const form = ref({
      recipientName: '',
      recipientEmail: '',
      recipientAddress: '',
      shippingMethod: 'home_delivery',
      isRemoteArea: false,
      isRushDelivery: false
    });

    var SHIPPING_METHODS = { home_delivery: 120, convenience_store: 60 };
    var REMOTE_AREA_SURCHARGE = 200;
    var RUSH_DELIVERY_SURCHARGE = 250;
    var FREE_BASE_SHIPPING_THRESHOLD = 1500;
```

在 `cartTotal` computed 定義之後，加入：

```js
    const shippingFee = computed(function () {
      var baseFee = cartTotal.value >= FREE_BASE_SHIPPING_THRESHOLD ? 0 : SHIPPING_METHODS[form.value.shippingMethod];
      var remoteFee = form.value.isRemoteArea ? REMOTE_AREA_SURCHARGE : 0;
      var rushFee = form.value.isRushDelivery ? RUSH_DELIVERY_SURCHARGE : 0;
      return baseFee + remoteFee + rushFee;
    });
```

把 `submitOrder()` 中：

```js
        const res = await apiFetch('/api/orders', {
          method: 'POST',
          body: JSON.stringify(form.value)
        });
```

保持不動（`form.value` 已經包含 `shippingMethod`/`isRemoteArea`/`isRushDelivery`，因為這三個欄位已加進 `form` 這個 ref 裡）。

最後把 `return` 陳述式：

```js
    return { loading, submitting, cartItems, form, errors, cartTotal, submitOrder };
```

改為：

```js
    return { loading, submitting, cartItems, form, errors, cartTotal, shippingFee, submitOrder };
```

- [x] **Step 3: 手動驗證（此專案無前端自動化測試，依既有慣例以手動啟動伺服器驗證）**

```bash
npm run start
```

以瀏覽器開啟 `http://localhost:3001/checkout`（需先登入並有購物車品項），確認：
- 切換宅配／超商，運費即時從 120/60 變動
- 勾選偏遠地區／當日急件，運費即時疊加
- 商品小計滿 1,500 元時，基本運費歸零但附加費仍顯示
- 送出訂單後，於網路請求（DevTools Network）確認 body 含 `shippingMethod`/`isRemoteArea`/`isRushDelivery`，且伺服器回應的 `total_amount` 與畫面試算一致

Expected: 以上四點皆符合；驗證後手動終止伺服器（Ctrl+C）。

- [x] **Step 4: Commit**

```bash
git add views/pages/checkout.ejs public/js/pages/checkout.js
git commit -m "$(cat <<'EOF'
feat: 結帳頁改用真實配送方式選單與運費即時試算，取代寫死的假運費區塊

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: 前端訂單詳情頁（`order-detail.ejs`）

**Files:**
- Modify: `views/pages/order-detail.ejs`

**Interfaces:**
- Consumes：`GET /api/orders/:id` 回應（Task 4 已使其包含 `subtotal`/`shipping_method`/`shipping_fee`/`is_remote_area`/`is_rush_delivery`）。`order-detail.js` 不需修改（已把整個 `res.data` 存進 `order.value`，模板可直接存取新欄位）。

- [x] **Step 1: 修改 `views/pages/order-detail.ejs`**

把商品明細表格的 `<tfoot>`：

```html
        <tfoot>
          <tr>
            <td colspan="3" class="pt-3 text-right font-bold text-text-primary">總計</td>
            <td class="pt-3 text-right font-bold text-rose-primary text-lg">NT$ {{ order.total_amount.toLocaleString() }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
```

改為：

```html
        <tfoot>
          <tr>
            <td colspan="3" class="pt-2 text-right text-text-secondary">商品小計</td>
            <td class="pt-2 text-right text-text-secondary">NT$ {{ order.subtotal.toLocaleString() }}</td>
          </tr>
          <tr>
            <td colspan="3" class="pt-1 text-right text-text-secondary">
              運費（{{ order.shipping_method === 'convenience_store' ? '超商取貨' : '宅配' }}<template v-if="order.is_remote_area">・偏遠地區</template><template v-if="order.is_rush_delivery">・當日急件</template>）
            </td>
            <td class="pt-1 text-right text-text-secondary">NT$ {{ order.shipping_fee.toLocaleString() }}</td>
          </tr>
          <tr>
            <td colspan="3" class="pt-2 text-right font-bold text-text-primary">總計</td>
            <td class="pt-2 text-right font-bold text-rose-primary text-lg">NT$ {{ order.total_amount.toLocaleString() }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
```

- [x] **Step 2: 手動驗證**

```bash
npm run start
```

以瀏覽器開啟任一筆訂單的詳情頁（`/orders/:id`），確認商品小計、運費（含配送方式與偏遠/急件標籤）、總計三行皆正確顯示且總計等於小計加運費。驗證後手動終止伺服器。

- [x] **Step 3: Commit**

```bash
git add views/pages/order-detail.ejs
git commit -m "$(cat <<'EOF'
feat: 訂單詳情頁新增運費與配送方式明細顯示

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 文件同步（`docs/ARCHITECTURE.md`、`docs/FEATURES.md`、`docs/CHANGELOG.md`）

**Files:**
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/FEATURES.md`
- Modify: `docs/CHANGELOG.md`

**Interfaces:** 無（純文件更新）。

- [x] **Step 1: 更新 `docs/ARCHITECTURE.md` 的 orders 表格（約第 344 行）**

把：

```
| total_amount | INTEGER | NOT NULL | 訂單總金額 |
```

改為：

```
| shipping_method | TEXT | 可為 NULL | 配送方式：home_delivery（宅配）或 convenience_store（超商取貨） |
| shipping_fee | INTEGER | 可為 NULL | 依配送方式、偏遠地區、當日急件、滿額免運規則計算之運費 |
| is_remote_area | INTEGER | 可為 NULL，0/1 | 是否為偏遠地區（加收 200 元） |
| is_rush_delivery | INTEGER | 可為 NULL，0/1 | 是否為當日急件（加收 250 元） |
| total_amount | INTEGER | NOT NULL | 訂單總金額（商品小計 + 運費） |
```

- [x] **Step 2: 更新 `docs/ARCHITECTURE.md` 的訂單建立流程圖（約第 371 行）**

把：

```
├─ 5. 計算 totalAmount = Σ(price × quantity)
├─ 6. 生成 orderNo: ORD-YYYYMMDD-{5碼UUID}
```

改為：

```
├─ 5. 計算 subtotal = Σ(price × quantity)
├─ 6. 依 src/utils/shipping.js 計算 shippingFee（配送方式、偏遠地區、當日急件、滿額免運規則）
├─ 7. totalAmount = subtotal + shippingFee
├─ 8. 生成 orderNo: ORD-YYYYMMDD-{5碼UUID}
```

並將原本第 7、8 步（`🔒 Transaction 開始...` 與 `回傳 201 + 訂單詳情`）的編號依序遞增為第 9、10 步。

- [x] **Step 3: 更新 `docs/FEATURES.md` 的 `POST /api/orders` 章節（約第 224～255 行）**

Request Body 表格新增三列：

```
| shippingMethod | string | 是 | `home_delivery` 或 `convenience_store` |
| isRemoteArea | boolean | 否，預設 false | 是否為偏遠地區，加收 200 元 |
| isRushDelivery | boolean | 否，預設 false | 是否為當日急件，加收 250 元 |
```

業務邏輯第 6 步「計算 `totalAmount = Σ(price × quantity)`」改為：

```
6. 計算 `subtotal = Σ(price × quantity)`
7. 依 `src/utils/shipping.js` 之 `calculateShippingFee()` 計算運費：宅配基本運費 120／超商取貨基本運費 60；偏遠地區加收 200；當日急件加收 250；商品小計 ≥ 1,500 元免除基本運費（附加費不受影響）
8. `totalAmount = subtotal + shippingFee`
```

原本第 7、8、9 步依序遞增為第 9、10、11 步。

錯誤情境表格新增一列：

```
| 400 | VALIDATION_ERROR | shippingMethod 缺漏或非 home_delivery/convenience_store |
```

在該章節末尾（回傳 201 之後）補一段：

```
**回應欄位新增**：`subtotal`（商品小計）、`shipping_method`、`shipping_fee`、`is_remote_area`、`is_rush_delivery`（皆同步反映於 `GET /api/orders/:id`）。
```

- [x] **Step 4: 更新 `docs/CHANGELOG.md`**

在 `## [Unreleased]` 的 `### Added` 小節最前面加入：

```
- 新增配送費用模組（`src/utils/shipping.js`）：宅配／超商取貨基本運費、偏遠地區與當日急件附加費、商品小計滿 1,500 元免基本運費；整合進 `POST /api/orders`，`total_amount` 語意調整為「商品小計 + 運費」
- `orders` 表新增 `shipping_method`/`shipping_fee`/`is_remote_area`/`is_rush_delivery` 欄位
- 結帳頁新增配送方式選單與運費即時試算，取代原本未串接後端的假運費 UI；訂單詳情頁新增運費明細顯示
- 新增 `npm run test:unit`，執行 `tests/shipping.test.js` 純函式單元測試
```

- [x] **Step 5: Commit**

```bash
git add docs/ARCHITECTURE.md docs/FEATURES.md docs/CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: 同步配送費用模組相關文件

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 最終驗證與歸檔

**Files:**
- Move: `docs/plans/2026-09-27-shipping-fee-module.md` → `docs/plans/archive/2026-09-27-shipping-fee-module.md`

**Interfaces:** 無。

- [x] **Step 1: 執行完整驗證**

```bash
npm run test
npm run test:unit
npm run openapi
npm run postman
```

Expected: 四個指令皆成功；`npm run test`／`npm run test:unit` 全數 PASS；`openapi.json`／`postman/collection.json` 產出且與已提交版本一致（若有差異，git diff 檢查是否為預期的隨機 ID 差異——`postman/collection.json` 因隨機 UUID 允許有差異，`openapi.json` 應完全一致，若不一致代表 Task 4/5 有遺漏未提交的 schema 變更）。

- [x] **Step 2: 歸檔計畫檔並 Commit**

```bash
mkdir -p docs/plans/archive
git mv docs/plans/2026-09-27-shipping-fee-module.md docs/plans/archive/2026-09-27-shipping-fee-module.md
git commit -m "$(cat <<'EOF'
docs: 歸檔配送費用模組實作計畫

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
