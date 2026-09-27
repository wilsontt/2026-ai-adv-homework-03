# OpenAPI 文件與驗證重構（Zod + zod-to-openapi）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以 Zod schema 取代六個 API 路由檔（auth/cart/order/product/adminOrder/adminProduct）手刻的 if 輸入驗證，並以 `@asteasolutions/zod-to-openapi` 由同一批 schema 產生 OpenAPI 文件，取代現行 `swagger-jsdoc` 方案；新增 `swagger-parser` 產檔前驗證與 `swagger-ui-express` 的 `/api-docs` 瀏覽頁。

**Architecture:** `src/schemas/*.schema.js` 定義 Zod schema（request 用於 `validate` middleware，response 用於文件）；`src/openapi/paths/*.paths.js` 呼叫 `registry.registerPath()` 註冊端點文件，此層只依賴 schemas，不 require 路由檔或 `src/database.js`；`src/openapi/generator.js` 彙整 registry 產生 document；路由檔改用 `validate(schema)` middleware 取代手刻 if 判斷。

**Tech Stack:** zod、@asteasolutions/zod-to-openapi、swagger-parser、swagger-ui-express（Node.js + Express + better-sqlite3 既有堆疊不變）。

**Spec:** `docs/plans/2026-09-27-openapi-migration.md`（本檔案上半部 User Story / Spec 兩節）

## Global Constraints

- 端點路徑、HTTP 方法、狀態碼不可變動；回應格式一律為 `{ data, error, message }`，驗證失敗固定回傳 400 + `error: 'VALIDATION_ERROR'`。
- `src/openapi/paths/*.js` 僅能 require `src/schemas/*` 與 `src/openapi/registry.js`，絕不 require 任何 `src/routes/*.js` 或 `src/database.js`（避免產文件時觸發建表/seed 副作用）。
- Query string 參數一律以 `z.preprocess`／`z.coerce` 處理字串轉型並複製現行 `Math.max`/`Math.min` 夾限邏輯；JSON body 欄位維持原生型別（`price`/`stock` 等本來就是 JSON number，不做字串轉型）。
- `validate` middleware 必須放在既有 `authMiddleware`／`dualAuth` 之後，確保未通過身份驗證時優先回 401，而非搶先回 400。
- registerPath 的 response schema 僅供 OpenAPI 文件呈現，不在 runtime 對外部回應做驗證；欄位命名以實際 DB 查詢與程式回傳物件為準，允許合理簡化巢狀結構（不影響正確性，只影響文件精細度）。
- Task 4～9（六個路由模組）之改動各自獨立 commit，便於 review 與回退。
- 新增測試一律以 `it()` 附加於對應既有測試檔案（`tests/auth.test.js`、`cart.test.js`、`orders.test.js`、`products.test.js`、`adminOrders.test.js`、`adminProducts.test.js`）內部指定位置，不另建與此六檔同層級的新檔案，以維持 `vitest.config.js` 既定的循序執行與共用 DB 假設；純函式的基礎設施測試（Task 2、3、10、11）可建立獨立新測試檔，因其不依賴共用 DB 狀態、不受既定執行順序影響。
- 既有六個 `tests/*.test.js` 檔案目前對驗證錯誤只斷言 `status`／`error` 代碼，不斷言 `message` 文字內容，因此本次遷移允許 `message` 文字與現行手刻版本不同，但錯誤代碼與狀態碼必須不變。

## Review Focus

- Query `page`/`limit` 為負數、0、非數字字串或超出上限時，應與現行 `Math.max`/`Math.min` 邏輯完全一致地退回預設值或夾限值（回 200），而非回傳 400 —— 由 Task 2 的 `normalizePage`/`normalizeLimit` 單元測試涵蓋所有邊界值，Task 7（Product）再以一組 HTTP 整合測試驗證實際掛載後的行為；Task 8（Admin Order）、Task 9（Admin Product）重用同一組 schema 函式，不重複相同的邊界測試。
- `dualAuth` 未通過（無 token 且無 `X-Session-Id`）時，即使 body 同時缺少必填欄位，仍應優先回 401 而非 400 —— 對應 Task 5（Cart）新增測試。
- Cart `quantity` 為 0、負數、非數字字串（如 `"abc"`）或小數（如 `1.5`）時應回 400 VALIDATION_ERROR，不得被 `z.coerce` 意外轉換通過 —— 對應 Task 5 測試。
- Admin Product `PUT` 局部更新時，欄位為空字串或全空白（如 `name: '   '`）應視為驗證錯誤（400），但欄位「未提供」（undefined）應視為維持原值、不觸發驗證錯誤，也不得覆蓋成 `undefined` —— 對應 Task 9 測試。
- Admin Order 列表的 `status` query 帶入不在列舉內的值（如 `status=xyz`）時，應比照現行行為「忽略此過濾條件、回傳全部」而非回 400 —— 對應 Task 8 測試。
- Auth `register`/`login` 對「欄位存在但型別錯誤」（例如 `password` 傳數字而非字串）之處理：現行手刻 if 對此無防護（`!password` 對數字 0 才會擋，其餘數字一律視為合法），Zod 會依型別檢查回 400 VALIDATION_ERROR，屬於規格隱含但現行程式碼未覆蓋的正確行為 —— 對應 Task 4 測試。

---

## User Story

作為後端開發者，我希望以 Zod schema 作為輸入驗證與 OpenAPI 文件的單一事實來源，取代現行手刻 if 驗證與 `swagger-jsdoc` 註解，以便降低文件與實際行為不同步之風險，並提供 Swagger UI 供瀏覽與測試。

## Spec

### 目標與範圍

- 全面遷移 6 個 API 路由檔之輸入驗證與 API 文件：`authRoutes.js`、`cartRoutes.js`、`orderRoutes.js`、`productRoutes.js`、`adminOrderRoutes.js`、`adminProductRoutes.js`。
- `pageRoutes.js` 為前台頁面路由（非 JSON API），不在本次範圍。
- 移除舊方案：`swagger-jsdoc` 套件、`swagger-config.js`、各路由檔內 `@openapi` JSDoc 區塊。

### 技術棧

| 套件 | 用途 |
|---|---|
| `zod` | Schema 定義與 runtime 驗證 |
| `@asteasolutions/zod-to-openapi` | 由 Zod schema 產生 OpenAPI 3 文件 |
| `swagger-parser` | 產檔前驗證 OpenAPI 規格合法性 |
| `swagger-ui-express` | 掛載 `/api-docs` 瀏覽頁 |

### 目錄與檔案配置

```
src/schemas/                # Zod schema，依模組拆分
  common.schema.js          # 共用回應信封、分頁 schema
  auth.schema.js
  cart.schema.js
  order.schema.js
  product.schema.js
  adminOrder.schema.js
  adminProduct.schema.js
src/openapi/
  registry.js                # OpenAPIRegistry 實例 + securitySchemes（bearerAuth、sessionAuth）
  paths/                      # registerPath()，僅依賴 schemas，不 require 路由/database.js
    auth.paths.js
    cart.paths.js
    order.paths.js
    product.paths.js
    adminOrder.paths.js
    adminProduct.paths.js
  generator.js                # 彙整 registry + paths → OpenApiGeneratorV3 → document
src/middleware/validate.js    # 通用 validate(schema) middleware
```

**設計決定**：`registerPath()` 獨立置於 `src/openapi/paths/`，不 require 路由檔本體。原因：`zod-to-openapi` 須實際執行程式碼取得註冊副作用（非如 `swagger-jsdoc` 純掃描註解文字），若 require 路由檔將連帶觸發 `require('../database')` 之建表／seed 動作，污染產文件流程。

### API 規格影響

- 端點路徑、方法、狀態碼與回應格式 `{ data, error, message }` 維持不變。
- 驗證錯誤（400）之 `message` 內容來源改為 Zod issue messages，文字可能與現行略有差異；`error` 代碼仍為 `VALIDATION_ERROR`。
- dualAuth 端點（購物車）OpenAPI security 宣告為 `[{ bearerAuth: [] }, { sessionAuth: [] }]`（OR 語意）。

### 資料庫變更

無。

### 業務規則

- `validate` middleware 僅取代輸入格式驗證（必填、型別、長度、格式）；業務規則（如 email 唯一性、庫存是否足夠）維持留在 route handler 內，不搬進 schema。
- Query 參數（如 `productRoutes` 的 `page`/`limit`）以 `z.coerce.number()` 處理字串轉型。

### Validate Middleware 設計

```js
// src/middleware/validate.js
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });
  if (!result.success) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: result.error.issues.map((i) => i.message).join('; ')
    });
  }
  req.validated = result.data;
  next();
};
module.exports = validate;
```

### 產生與驗證流程（`generate-openapi.js`）

```js
const generator = require('./src/openapi/generator');
const SwaggerParser = require('swagger-parser');
const fs = require('fs');

(async () => {
  const document = generator.generateDocument();
  await SwaggerParser.validate(document); // 不合法即擲例外
  fs.writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  console.log('openapi.json generated and validated successfully');
})().catch((err) => {
  console.error('OpenAPI 產生失敗：', err.message);
  process.exit(1);
});
```

`app.js` 另掛 `GET /openapi.json`（伺服器啟動時 build 一次同一份 document）與 `swagger-ui-express` 於 `/api-docs`。

## Tasks

### Task 1: 安裝與移除相依套件

**Files:**
- Modify: `package.json`（連帶更新 `package-lock.json`）

**Interfaces:** 無（純套件安裝，不產生程式介面）。

- [ ] **Step 1: 安裝新套件**

```bash
npm install zod @asteasolutions/zod-to-openapi swagger-parser swagger-ui-express
```

- [ ] **Step 2: 移除舊套件**

```bash
npm uninstall swagger-jsdoc
```

- [ ] **Step 3: 驗證套件可正常載入**

```bash
node -e "require('zod'); require('@asteasolutions/zod-to-openapi'); require('swagger-parser'); require('swagger-ui-express'); console.log('OK')"
```

Expected: 印出 `OK`，無例外拋出。

- [ ] **Step 4: 確認 package.json 異動**

```bash
git diff package.json
```

Expected: `dependencies` 新增 4 個套件、移除 `swagger-jsdoc`。

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
chore: 新增 zod/zod-to-openapi/swagger-parser/swagger-ui-express，移除 swagger-jsdoc

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `src/openapi/registry.js` + `src/schemas/common.schema.js`

**Files:**
- Create: `src/openapi/registry.js`
- Create: `src/schemas/common.schema.js`
- Test: `tests/schemas.common.test.js`

**Interfaces:**
- Produces（`src/openapi/registry.js`）：`module.exports = registry`，一個 `OpenAPIRegistry` 實例，已註冊 `securitySchemes.bearerAuth`（`{ type:'http', scheme:'bearer', bearerFormat:'JWT' }`）與 `securitySchemes.sessionAuth`（`{ type:'apiKey', in:'header', name:'X-Session-Id' }`）。所有 `src/openapi/paths/*.js` 皆消費此模組。
- Produces（`src/schemas/common.schema.js`）：`{ pageQuerySchema, limitQuerySchema, paginationSchema, errorEnvelope, normalizePage, normalizeLimit }`。`pageQuerySchema`/`limitQuerySchema` 為 Zod schema（`parse(undefined)` 回傳數字，非 `undefined`）；`errorEnvelope(dataSchema)` 回傳 `z.object({ data: dataSchema, error: z.string().nullable(), message: z.string() })`；`paginationSchema` 為 `{ total, page, limit, totalPages }`（皆 `z.number()`）。Task 7/8/9 消費 `pageQuerySchema`/`limitQuerySchema`/`paginationSchema`；所有 paths 檔消費 `errorEnvelope`。

- [ ] **Step 1: 寫測試（common schema 的邊界行為與 registry 的 securitySchemes）**

建立 `tests/schemas.common.test.js`：

```js
const { z } = require('zod');
const {
  pageQuerySchema,
  limitQuerySchema,
  normalizePage,
  normalizeLimit,
  errorEnvelope
} = require('../src/schemas/common.schema');

describe('common schema helpers', () => {
  it('normalizePage falls back to 1 for invalid input, matching legacy Math.max(1, parseInt(x)||1)', () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage('abc')).toBe(1);
    expect(normalizePage('0')).toBe(1);
    expect(normalizePage('-5')).toBe(1);
    expect(normalizePage('3')).toBe(3);
  });

  it('normalizeLimit clamps to [1,100] and falls back to 10, matching legacy Math.max(1, Math.min(100, parseInt(x)||10))', () => {
    expect(normalizeLimit(undefined)).toBe(10);
    expect(normalizeLimit('abc')).toBe(10);
    expect(normalizeLimit('0')).toBe(10);
    expect(normalizeLimit('-5')).toBe(1);
    expect(normalizeLimit('500')).toBe(100);
    expect(normalizeLimit('50')).toBe(50);
  });

  it('pageQuerySchema/limitQuerySchema apply the same normalization via zod', () => {
    expect(pageQuerySchema.parse(undefined)).toBe(1);
    expect(limitQuerySchema.parse('500')).toBe(100);
  });
});

describe('errorEnvelope', () => {
  it('wraps a data schema with { data, error, message }', () => {
    const schema = errorEnvelope(z.object({ id: z.string() }));
    const result = schema.safeParse({ data: { id: 'x' }, error: null, message: 'ok' });
    expect(result.success).toBe(true);
  });
});

describe('registry', () => {
  it('registers bearerAuth and sessionAuth security schemes', () => {
    const { OpenApiGeneratorV3 } = require('@asteasolutions/zod-to-openapi');
    const registry = require('../src/openapi/registry');
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const document = generator.generateDocument({
      openapi: '3.0.3',
      info: { title: 'test', version: '0.0.0' }
    });
    expect(document.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    });
    expect(document.components.securitySchemes.sessionAuth).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-Session-Id'
    });
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/schemas.common.test.js
```

Expected: FAIL（`Cannot find module '../src/schemas/common.schema'` / `'../src/openapi/registry'`）。

- [ ] **Step 3: 實作 `src/schemas/common.schema.js`**

```js
const { z } = require('zod');

function normalizePage(val) {
  const n = parseInt(val, 10);
  return (Number.isInteger(n) && n >= 1) ? n : 1;
}

function normalizeLimit(val) {
  const n = parseInt(val, 10);
  const base = (Number.isInteger(n) && n !== 0) ? n : 10;
  return Math.max(1, Math.min(100, base));
}

const pageQuerySchema = z.preprocess(normalizePage, z.number().int());
const limitQuerySchema = z.preprocess(normalizeLimit, z.number().int());

const paginationSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number()
});

const errorEnvelope = (dataSchema) => z.object({
  data: dataSchema,
  error: z.string().nullable(),
  message: z.string()
});

module.exports = {
  pageQuerySchema,
  limitQuerySchema,
  paginationSchema,
  errorEnvelope,
  normalizePage,
  normalizeLimit
};
```

- [ ] **Step 4: 實作 `src/openapi/registry.js`**

```js
const { OpenAPIRegistry } = require('@asteasolutions/zod-to-openapi');

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT'
});

registry.registerComponent('securitySchemes', 'sessionAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-Session-Id'
});

module.exports = registry;
```

- [ ] **Step 5: 執行測試，確認通過**

```bash
npx vitest run tests/schemas.common.test.js
```

Expected: PASS（4 個 it 全數通過）。

- [ ] **Step 6: Commit**

```bash
git add src/schemas/common.schema.js src/openapi/registry.js tests/schemas.common.test.js
git commit -m "$(cat <<'EOF'
feat: 新增 OpenAPI registry 與共用 Zod schema（分頁、回應信封）

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `src/middleware/validate.js`

**Files:**
- Create: `src/middleware/validate.js`
- Test: `tests/middleware.validate.test.js`

**Interfaces:**
- Consumes: 任一 Zod schema，其 `safeParse` 輸入形狀為 `{ body, query, params }`。
- Produces: `module.exports = validate`；`validate(schema)` 回傳 Express middleware `(req, res, next) => void`。驗證成功時設定 `req.validated = { body, query, params }`（已通過 schema 轉換後的值）並呼叫 `next()`；失敗時呼叫 `res.status(400).json({ data: null, error: 'VALIDATION_ERROR', message })` 並「不」呼叫 `next()`。Task 4～9 的路由檔皆消費此函式與 `req.validated`。

- [ ] **Step 1: 寫失敗測試**

建立 `tests/middleware.validate.test.js`：

```js
const { z } = require('zod');
const validate = require('../src/middleware/validate');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('validate middleware', () => {
  const schema = z.object({
    body: z.object({ name: z.string().min(1) }),
    query: z.object({}),
    params: z.object({})
  });

  it('calls next() and sets req.validated when input is valid', () => {
    const req = { body: { name: 'flower' }, query: {}, params: {} };
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validated).toEqual({ body: { name: 'flower' }, query: {}, params: {} });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 400 VALIDATION_ERROR and does not call next() when input is invalid', () => {
    const req = { body: { name: '' }, query: {}, params: {} };
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: null, error: 'VALIDATION_ERROR' })
    );
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/middleware.validate.test.js
```

Expected: FAIL（`Cannot find module '../src/middleware/validate'`）。

- [ ] **Step 3: 實作 `src/middleware/validate.js`**

```js
const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });

  if (!result.success) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: result.error.issues.map((issue) => issue.message).join('; ')
    });
  }

  req.validated = result.data;
  next();
};

module.exports = validate;
```

- [ ] **Step 4: 執行測試，確認通過**

```bash
npx vitest run tests/middleware.validate.test.js
```

Expected: PASS（2 個 it 全數通過）。

- [ ] **Step 5: Commit**

```bash
git add src/middleware/validate.js tests/middleware.validate.test.js
git commit -m "$(cat <<'EOF'
feat: 新增 Zod validate middleware 取代手刻 if 驗證

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Auth 模組（`authRoutes.js`）

> 本任務為「行為保持不變」的重構：新增的測試在現行手刻 if 驗證下即應已通過（作為安全網），而非先紅後綠。流程為「加測試→確認現行程式碼已通過→替換實作→確認測試仍通過」。

**Files:**
- Create: `src/schemas/auth.schema.js`
- Create: `src/openapi/paths/auth.paths.js`
- Modify: `src/routes/authRoutes.js`（全檔改寫）
- Test: `tests/auth.test.js`（於檔案結尾、`});` 之前插入新 `it()`）

**Interfaces:**
- Consumes: `validate`（Task 3）、`errorEnvelope`（Task 2）、`registry`（Task 2）。
- Produces（`src/schemas/auth.schema.js`）：`{ registerBodySchema, loginBodySchema, registerRequestSchema, loginRequestSchema, authTokenResponseSchema, profileResponseSchema }`。`registerRequestSchema`/`loginRequestSchema` 供 `authRoutes.js` 的 `validate()` 使用；`registerBodySchema`/`loginBodySchema`/`authTokenResponseSchema`/`profileResponseSchema` 供 `auth.paths.js` 的 `registerPath()` 使用。

- [ ] **Step 1: 於 `tests/auth.test.js` 加入新測試**

在檔案內 `describe('Auth API', () => { ... })` 的最後一個 `it` 之後、結尾 `});` 之前插入：

```js
  it('should fail to register when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'missing-fields@example.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to register with invalid email format', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'password123', name: '測試' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to register with password shorter than 6 characters', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `short-pw-${Date.now()}@example.com`, password: '123', name: '測試' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail login when body fields are missing', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@hexschool.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to register when password has the wrong type (number instead of string)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: `type-error-${Date.now()}@example.com`, password: 123456, name: '測試' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });
```

- [ ] **Step 2: 執行測試，確認新測試的結果符合預期**

```bash
npx vitest run tests/auth.test.js
```

Expected: 除「password 型別錯誤」該筆測試外皆 PASS。現行手刻 if 驗證僅以 `!password` 判斷必填，`password: 123456` 是 truthy 的數字，不會被攔下，故該筆會先呼叫 `bcrypt.hashSync(123456, 10)`（bcrypt 內部對非字串輸入會拋出例外）並回應 500，而非預期的 400；此為現行程式碼在規格上的既有缺口，等 Step 5 換成 Zod 型別檢查後即會轉為 400 並通過。此筆測試允許在 Step 2 呈現 FAIL，其餘沿用既有行為的測試仍應在此步驟全數 PASS。

- [ ] **Step 3: 建立 `src/schemas/auth.schema.js`**

```js
const { z } = require('zod');

const registerBodySchema = z.object({
  email: z.string().min(1, 'email、password、name 為必填欄位').email('Email 格式不正確'),
  password: z.string().min(6, '密碼至少需要 6 個字元'),
  name: z.string().min(1, 'email、password、name 為必填欄位')
});

const loginBodySchema = z.object({
  email: z.string().min(1, 'email 和 password 為必填欄位'),
  password: z.string().min(1, 'email 和 password 為必填欄位')
});

const registerRequestSchema = z.object({ body: registerBodySchema, query: z.object({}), params: z.object({}) });
const loginRequestSchema = z.object({ body: loginBodySchema, query: z.object({}), params: z.object({}) });

const userPublicSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string()
});

const authTokenResponseSchema = z.object({
  user: userPublicSchema,
  token: z.string()
});

const profileResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  created_at: z.string()
});

module.exports = {
  registerBodySchema,
  loginBodySchema,
  registerRequestSchema,
  loginRequestSchema,
  authTokenResponseSchema,
  profileResponseSchema
};
```

- [ ] **Step 4: 建立 `src/openapi/paths/auth.paths.js`**

```js
const registry = require('../registry');
const {
  registerBodySchema,
  loginBodySchema,
  authTokenResponseSchema,
  profileResponseSchema
} = require('../../schemas/auth.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: registerBodySchema } } } },
  responses: {
    201: { description: '註冊成功', content: { 'application/json': { schema: errorEnvelope(authTokenResponseSchema) } } },
    400: { description: '參數缺失或格式錯誤' },
    409: { description: 'Email 已被註冊' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: loginBodySchema } } } },
  responses: {
    200: { description: '登入成功', content: { 'application/json': { schema: errorEnvelope(authTokenResponseSchema) } } },
    400: { description: '參數缺失' },
    401: { description: 'Email 或密碼錯誤' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/profile',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(profileResponseSchema) } } },
    401: { description: '未登入或 token 無效' }
  }
});
```

- [ ] **Step 5: 改寫 `src/routes/authRoutes.js`（全檔取代）**

```js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { registerRequestSchema, loginRequestSchema } = require('../schemas/auth.schema');

const router = express.Router();

router.post('/register', validate(registerRequestSchema), (req, res) => {
  const { email, password, name } = req.validated.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({
      data: null,
      error: 'CONFLICT',
      message: 'Email 已被註冊'
    });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, passwordHash, name, 'user');

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '註冊成功'
  });
});

router.post('/login', validate(loginRequestSchema), (req, res) => {
  const { email, password } = req.validated.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '登入成功'
  });
});

router.get('/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.userId);

  if (!user) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '使用者不存在' });
  }

  res.json({ data: user, error: null, message: '成功' });
});

module.exports = router;
```

- [ ] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/auth.test.js
```

Expected: PASS（含原有測試與 Step 1 新增測試）。

- [ ] **Step 7: Commit**

```bash
git add src/schemas/auth.schema.js src/openapi/paths/auth.paths.js src/routes/authRoutes.js tests/auth.test.js
git commit -m "$(cat <<'EOF'
refactor: Auth 路由改用 Zod schema + validate middleware，移除手刻驗證與 @openapi 註解

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Cart 模組（`cartRoutes.js`）

> 同 Task 4，屬行為保持不變之重構：先加測試建立安全網，再替換實作。

**Files:**
- Create: `src/schemas/cart.schema.js`
- Create: `src/openapi/paths/cart.paths.js`
- Modify: `src/routes/cartRoutes.js`（全檔改寫，`dualAuth`/`getOwnerCondition` 函式保留不變）
- Test: `tests/cart.test.js`（於結尾插入新 `it()`）

**Interfaces:**
- Consumes: `validate`（Task 3）、`errorEnvelope`（Task 2）。
- Produces（`src/schemas/cart.schema.js`）：`{ addCartBodySchema, updateCartBodySchema, getCartRequestSchema, addCartRequestSchema, updateCartRequestSchema, deleteCartRequestSchema, getCartResponseSchema, mutateCartResponseSchema }`。

- [ ] **Step 1: 於 `tests/cart.test.js` 加入新測試**

在檔案內最後一個 `it` 之後、結尾 `});` 之前插入：

```js
  it('should return 401 (not 400) when dualAuth fails even with an invalid body', async () => {
    const res = await request(app)
      .post('/api/cart')
      .send({});

    expect(res.status).toBe(401);
  });

  it('should fail to add to cart with a non-numeric quantity', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to update cart item quantity to zero', async () => {
    const addRes = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 1 });
    const itemId = addRes.body.data.id;

    const res = await request(app)
      .patch(`/api/cart/${itemId}`)
      .set('X-Session-Id', sessionId)
      .send({ quantity: 0 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to add to cart with a decimal quantity', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 1.5 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });
```

- [ ] **Step 2: 執行測試，確認結果符合預期**

```bash
npx vitest run tests/cart.test.js
```

Expected: 除「小數 quantity」該筆測試外皆 PASS。現行手刻邏輯為 `parseInt(1.5)` 會截斷為 `1`，`Number.isInteger(1)` 為 true，故現行程式碼會回 200（視為 `quantity=1`）而非 400；這是本次遷移刻意收緊的行為（Zod 的 `z.coerce.number().int()` 對小數會直接判定非整數並回 400），Step 5 換成新實作後該筆測試才會轉為 PASS。其餘沿用既有行為的測試在此步驟應全數 PASS。

- [ ] **Step 3: 建立 `src/schemas/cart.schema.js`**

```js
const { z } = require('zod');

const quantitySchema = z.coerce
  .number({ invalid_type_error: 'quantity 必須為正整數' })
  .int('quantity 必須為正整數')
  .positive('quantity 必須為正整數');

const addCartBodySchema = z.object({
  productId: z.string().min(1, 'productId 為必填欄位'),
  quantity: quantitySchema.optional().default(1)
});

const updateCartBodySchema = z.object({
  quantity: quantitySchema
});

const cartItemIdParamsSchema = z.object({ itemId: z.string().min(1) });

const getCartRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: z.object({}) });
const addCartRequestSchema = z.object({ body: addCartBodySchema, query: z.object({}), params: z.object({}) });
const updateCartRequestSchema = z.object({ body: updateCartBodySchema, query: z.object({}), params: cartItemIdParamsSchema });
const deleteCartRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: cartItemIdParamsSchema });

const cartProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  stock: z.number(),
  image_url: z.string().nullable()
});

const cartItemResponseSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  quantity: z.number(),
  product: cartProductSchema
});

const getCartResponseSchema = z.object({
  items: z.array(cartItemResponseSchema),
  total: z.number()
});

const mutateCartResponseSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  quantity: z.number()
});

module.exports = {
  addCartBodySchema,
  updateCartBodySchema,
  getCartRequestSchema,
  addCartRequestSchema,
  updateCartRequestSchema,
  deleteCartRequestSchema,
  getCartResponseSchema,
  mutateCartResponseSchema
};
```

- [ ] **Step 4: 建立 `src/openapi/paths/cart.paths.js`**

```js
const { z } = require('zod');
const registry = require('../registry');
const {
  addCartBodySchema,
  updateCartBodySchema,
  getCartResponseSchema,
  mutateCartResponseSchema
} = require('../../schemas/cart.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

const cartSecurity = [{ bearerAuth: [] }, { sessionAuth: [] }];

registry.registerPath({
  method: 'get',
  path: '/api/cart',
  tags: ['Cart'],
  security: cartSecurity,
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(getCartResponseSchema) } } }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/cart',
  tags: ['Cart'],
  security: cartSecurity,
  request: { body: { content: { 'application/json': { schema: addCartBodySchema } } } },
  responses: {
    200: { description: '已加入購物車', content: { 'application/json': { schema: errorEnvelope(mutateCartResponseSchema) } } },
    400: { description: '參數缺失或庫存不足' },
    404: { description: '商品不存在' }
  }
});

registry.registerPath({
  method: 'patch',
  path: '/api/cart/{itemId}',
  tags: ['Cart'],
  security: cartSecurity,
  request: {
    params: z.object({ itemId: z.string() }),
    body: { content: { 'application/json': { schema: updateCartBodySchema } } }
  },
  responses: {
    200: { description: '數量已更新', content: { 'application/json': { schema: errorEnvelope(mutateCartResponseSchema) } } },
    400: { description: '庫存不足' },
    404: { description: '購物車項目不存在' }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/cart/{itemId}',
  tags: ['Cart'],
  security: cartSecurity,
  request: { params: z.object({ itemId: z.string() }) },
  responses: {
    200: { description: '已從購物車移除', content: { 'application/json': { schema: errorEnvelope(z.null()) } } },
    404: { description: '購物車項目不存在' }
  }
});
```

- [ ] **Step 5: 改寫 `src/routes/cartRoutes.js`（全檔取代）**

```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const db = require('../database');
const validate = require('../middleware/validate');
const {
  getCartRequestSchema,
  addCartRequestSchema,
  updateCartRequestSchema,
  deleteCartRequestSchema
} = require('../schemas/cart.schema');

const router = express.Router();

// Dual-mode auth: try JWT first, fall back to session
function dualAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
      if (!user) {
        return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: '使用者不存在，請重新登入' });
      }

      req.user = { userId: decoded.userId, email: decoded.email, role: decoded.role };
      return next();
    } catch (err) {
      return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: 'Token 無效或已過期' });
    }
  }

  if (req.sessionId) {
    return next();
  }

  return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: '請提供有效的登入 Token 或 X-Session-Id' });
}

function getOwnerCondition(req) {
  if (req.user) {
    return { field: 'user_id', value: req.user.userId };
  }
  return { field: 'session_id', value: req.sessionId };
}

router.get('/', dualAuth, validate(getCartRequestSchema), (req, res) => {
  const owner = getOwnerCondition(req);
  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price,
            p.stock as product_stock, p.image_url as product_image_url
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.${owner.field} = ?`
  ).all(owner.value);

  const items = cartItems.map(item => ({
    id: item.id,
    product_id: item.product_id,
    quantity: item.quantity,
    product: {
      name: item.product_name,
      price: item.product_price,
      stock: item.product_stock,
      image_url: item.product_image_url
    }
  }));

  const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  res.json({ data: { items, total }, error: null, message: '成功' });
});

router.post('/', dualAuth, validate(addCartRequestSchema), (req, res) => {
  const { productId, quantity } = req.validated.body;

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  const owner = getOwnerCondition(req);

  const existingItem = db.prepare(
    `SELECT * FROM cart_items WHERE product_id = ? AND ${owner.field} = ?`
  ).get(productId, owner.value);

  if (existingItem) {
    const newQty = existingItem.quantity + quantity;
    if (newQty > product.stock) {
      return res.status(400).json({ data: null, error: 'STOCK_INSUFFICIENT', message: '庫存不足' });
    }
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existingItem.id);
    return res.json({ data: { id: existingItem.id, product_id: productId, quantity: newQty }, error: null, message: '已加入購物車' });
  }

  if (quantity > product.stock) {
    return res.status(400).json({ data: null, error: 'STOCK_INSUFFICIENT', message: '庫存不足' });
  }
  const id = uuidv4();
  db.prepare(
    `INSERT INTO cart_items (id, ${owner.field}, product_id, quantity) VALUES (?, ?, ?, ?)`
  ).run(id, owner.value, productId, quantity);
  res.json({ data: { id, product_id: productId, quantity }, error: null, message: '已加入購物車' });
});

router.patch('/:itemId', dualAuth, validate(updateCartRequestSchema), (req, res) => {
  const { itemId } = req.validated.params;
  const { quantity } = req.validated.body;

  const owner = getOwnerCondition(req);
  const item = db.prepare(
    `SELECT * FROM cart_items WHERE id = ? AND ${owner.field} = ?`
  ).get(itemId, owner.value);

  if (!item) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '購物車項目不存在' });
  }

  const product = db.prepare('SELECT stock FROM products WHERE id = ?').get(item.product_id);
  if (quantity > product.stock) {
    return res.status(400).json({ data: null, error: 'STOCK_INSUFFICIENT', message: '庫存不足' });
  }

  db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(quantity, itemId);

  res.json({ data: { id: itemId, product_id: item.product_id, quantity }, error: null, message: '數量已更新' });
});

router.delete('/:itemId', dualAuth, validate(deleteCartRequestSchema), (req, res) => {
  const { itemId } = req.validated.params;
  const owner = getOwnerCondition(req);

  const item = db.prepare(
    `SELECT id FROM cart_items WHERE id = ? AND ${owner.field} = ?`
  ).get(itemId, owner.value);

  if (!item) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '購物車項目不存在' });
  }

  db.prepare('DELETE FROM cart_items WHERE id = ?').run(itemId);

  res.json({ data: null, error: null, message: '已從購物車移除' });
});

module.exports = router;
```

- [ ] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/cart.test.js
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/schemas/cart.schema.js src/openapi/paths/cart.paths.js src/routes/cartRoutes.js tests/cart.test.js
git commit -m "$(cat <<'EOF'
refactor: Cart 路由改用 Zod schema + validate middleware，移除手刻驗證與 @openapi 註解

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Order 模組（`orderRoutes.js`）

> 同 Task 4，屬行為保持不變之重構。

**Files:**
- Create: `src/schemas/order.schema.js`
- Create: `src/openapi/paths/order.paths.js`
- Modify: `src/routes/orderRoutes.js`（全檔改寫）
- Test: `tests/orders.test.js`（於結尾插入新 `it()`）

**Interfaces:**
- Consumes: `validate`（Task 3）、`errorEnvelope`（Task 2）、`queryTradeInfo`（`src/utils/ecpay.js`，既有，不變動）。
- Produces（`src/schemas/order.schema.js`）：`{ createOrderBodySchema, payOrderBodySchema, createOrderRequestSchema, listOrdersRequestSchema, orderDetailRequestSchema, payOrderRequestSchema, checkPaymentRequestSchema, orderRecordSchema, orderDetailSchema, listOrdersResponseSchema }`。

- [ ] **Step 1: 於 `tests/orders.test.js` 加入新測試**

在檔案內最後一個 `it`（`'should return 404 for non-existent order'`）之後、結尾 `});` 之前插入：

```js
  it('should fail to create order with missing recipient fields', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ recipientName: '測試' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to create order with an invalid recipient email', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ recipientName: '測試', recipientEmail: 'not-an-email', recipientAddress: '台北市' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to pay with an invalid action value', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'not-a-valid-action' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });
```

- [ ] **Step 2: 執行測試，確認在現行程式碼下已通過**

```bash
npx vitest run tests/orders.test.js
```

Expected: PASS。

- [ ] **Step 3: 建立 `src/schemas/order.schema.js`**

```js
const { z } = require('zod');

const createOrderBodySchema = z.object({
  recipientName: z.string().min(1, '收件人姓名、Email 和地址為必填欄位'),
  recipientEmail: z.string().min(1, '收件人姓名、Email 和地址為必填欄位').email('Email 格式不正確'),
  recipientAddress: z.string().min(1, '收件人姓名、Email 和地址為必填欄位')
});

const payOrderBodySchema = z.object({
  action: z.enum(['success', 'fail'], { errorMap: () => ({ message: 'action 必須為 success 或 fail' }) })
});

const orderIdParamsSchema = z.object({ id: z.string().min(1) });

const createOrderRequestSchema = z.object({ body: createOrderBodySchema, query: z.object({}), params: z.object({}) });
const listOrdersRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: z.object({}) });
const orderDetailRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: orderIdParamsSchema });
const payOrderRequestSchema = z.object({ body: payOrderBodySchema, query: z.object({}), params: orderIdParamsSchema });
const checkPaymentRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: orderIdParamsSchema });

const orderItemBriefSchema = z.object({
  product_name: z.string(),
  product_price: z.number(),
  quantity: z.number()
});

const orderItemDetailSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  product_price: z.number(),
  quantity: z.number()
});

const orderRecordSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string(),
  items: z.array(orderItemBriefSchema)
});

const orderDetailSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  recipient_address: z.string(),
  total_amount: z.number(),
  status: z.string(),
  merchant_trade_no: z.string().nullable(),
  created_at: z.string(),
  items: z.array(orderItemDetailSchema)
});

const listOrdersResponseSchema = z.object({
  orders: z.array(z.object({
    id: z.string(),
    order_no: z.string(),
    total_amount: z.number(),
    status: z.string(),
    created_at: z.string()
  }))
});

module.exports = {
  createOrderBodySchema,
  payOrderBodySchema,
  createOrderRequestSchema,
  listOrdersRequestSchema,
  orderDetailRequestSchema,
  payOrderRequestSchema,
  checkPaymentRequestSchema,
  orderRecordSchema,
  orderDetailSchema,
  listOrdersResponseSchema
};
```

- [ ] **Step 4: 建立 `src/openapi/paths/order.paths.js`**

```js
const { z } = require('zod');
const registry = require('../registry');
const {
  createOrderBodySchema,
  payOrderBodySchema,
  orderRecordSchema,
  orderDetailSchema,
  listOrdersResponseSchema
} = require('../../schemas/order.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

const idParam = z.object({ id: z.string() });

registry.registerPath({
  method: 'post',
  path: '/api/orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createOrderBodySchema } } } },
  responses: {
    201: { description: '訂單建立成功', content: { 'application/json': { schema: errorEnvelope(orderRecordSchema) } } },
    400: { description: '購物車為空或庫存不足或收件資訊缺失' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listOrdersResponseSchema) } } }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/orders/{id}',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(orderDetailSchema) } } },
    404: { description: '訂單不存在' }
  }
});

registry.registerPath({
  method: 'patch',
  path: '/api/orders/{id}/pay',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: idParam, body: { content: { 'application/json': { schema: payOrderBodySchema } } } },
  responses: {
    200: { description: '付款狀態更新成功', content: { 'application/json': { schema: errorEnvelope(orderRecordSchema) } } },
    400: { description: 'action 無效或訂單狀態不是 pending' },
    404: { description: '訂單不存在' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/orders/{id}/check-payment',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: '查詢成功' },
    400: { description: '訂單狀態不是 pending' },
    404: { description: '訂單不存在' }
  }
});
```

- [ ] **Step 5: 改寫 `src/routes/orderRoutes.js`（全檔取代）**

```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { queryTradeInfo } = require('../utils/ecpay');
const {
  createOrderRequestSchema,
  listOrdersRequestSchema,
  orderDetailRequestSchema,
  payOrderRequestSchema,
  checkPaymentRequestSchema
} = require('../schemas/order.schema');

const router = express.Router();

router.use(authMiddleware);

function generateOrderNo() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const random = uuidv4().slice(0, 5).toUpperCase();
  return `ORD-${dateStr}-${random}`;
}

router.post('/', validate(createOrderRequestSchema), (req, res) => {
  const { recipientName, recipientEmail, recipientAddress } = req.validated.body;
  const userId = req.user.userId;

  const cartItems = db.prepare(
    `SELECT ci.id, ci.product_id, ci.quantity,
            p.name as product_name, p.price as product_price, p.stock as product_stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.user_id = ?`
  ).all(userId);

  if (cartItems.length === 0) {
    return res.status(400).json({ data: null, error: 'CART_EMPTY', message: '購物車為空' });
  }

  const insufficientItems = cartItems.filter(item => item.quantity > item.product_stock);
  if (insufficientItems.length > 0) {
    const names = insufficientItems.map(i => i.product_name).join(', ');
    return res.status(400).json({ data: null, error: 'STOCK_INSUFFICIENT', message: `以下商品庫存不足：${names}` });
  }

  const totalAmount = cartItems.reduce((sum, item) => sum + item.product_price * item.quantity, 0);

  const orderId = uuidv4();
  const orderNo = generateOrderNo();
  const merchantTradeNo = orderNo.replace(/-/g, '');

  const createOrder = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, order_no, user_id, recipient_name, recipient_email, recipient_address, total_amount, merchant_trade_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(orderId, orderNo, userId, recipientName, recipientEmail, recipientAddress, totalAmount, merchantTradeNo);

    const insertItem = db.prepare(
      `INSERT INTO order_items (id, order_id, product_id, product_name, product_price, quantity)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of cartItems) {
      insertItem.run(uuidv4(), orderId, item.product_id, item.product_name, item.product_price, item.quantity);
      updateStock.run(item.quantity, item.product_id);
    }

    db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(userId);
  });

  createOrder();

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  const orderItems = db.prepare(
    'SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?'
  ).all(orderId);

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
});

router.get('/', validate(listOrdersRequestSchema), (req, res) => {
  const orders = db.prepare(
    'SELECT id, order_no, total_amount, status, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC'
  ).all(req.user.userId);

  res.json({ data: { orders }, error: null, message: '成功' });
});

router.get('/:id', validate(orderDetailRequestSchema), (req, res) => {
  const { id } = req.validated.params;
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, req.user.userId);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({ data: { ...order, items }, error: null, message: '成功' });
});

router.patch('/:id/pay', validate(payOrderRequestSchema), (req, res) => {
  const { action } = req.validated.body;
  const { id } = req.validated.params;
  const userId = req.user.userId;

  const actionMap = { success: 'paid', fail: 'failed' };

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({ data: null, error: 'INVALID_STATUS', message: '訂單狀態不是 pending，無法付款' });
  }

  const newStatus = actionMap[action];
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(newStatus, order.id);

  const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);

  res.json({
    data: { ...updated, items },
    error: null,
    message: action === 'success' ? '付款成功' : '付款失敗'
  });
});

router.post('/:id/check-payment', validate(checkPaymentRequestSchema), async (req, res) => {
  const { id } = req.validated.params;
  const userId = req.user.userId;

  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(id, userId);
  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  if (order.status !== 'pending') {
    const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    return res.json({
      data: { ...order, items },
      error: null,
      message: order.status === 'paid' ? '此訂單已付款' : '此訂單付款失敗'
    });
  }

  if (!order.merchant_trade_no) {
    return res.status(400).json({ data: null, error: 'NO_TRADE_NO', message: '此訂單無綠界交易編號' });
  }

  try {
    const result = await queryTradeInfo(order.merchant_trade_no);

    if (result.TradeStatus === '1') {
      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', order.id);
      const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
      const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
      return res.json({ data: { ...updated, items }, error: null, message: '付款成功' });
    }

    const items = db.prepare('SELECT product_name, product_price, quantity FROM order_items WHERE order_id = ?').all(order.id);
    return res.json({
      data: { ...order, items, ecpay_trade_status: result.TradeStatus },
      error: null,
      message: '尚未完成付款，請稍後再查詢'
    });
  } catch (err) {
    console.error('[ECPay] QueryTradeInfo error:', err.message);
    return res.status(500).json({ data: null, error: 'ECPAY_QUERY_ERROR', message: '查詢綠界付款狀態失敗：' + err.message });
  }
});

module.exports = router;
```

- [ ] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/orders.test.js
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/schemas/order.schema.js src/openapi/paths/order.paths.js src/routes/orderRoutes.js tests/orders.test.js
git commit -m "$(cat <<'EOF'
refactor: Order 路由改用 Zod schema + validate middleware，移除手刻驗證與 @openapi 註解

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Product 模組（`productRoutes.js`）

> 同 Task 4，屬行為保持不變之重構；重點覆蓋 Review Focus 的 page/limit 邊界情境。

**Files:**
- Create: `src/schemas/product.schema.js`
- Create: `src/openapi/paths/product.paths.js`
- Modify: `src/routes/productRoutes.js`（全檔改寫）
- Test: `tests/products.test.js`（於結尾插入新 `it()`）

**Interfaces:**
- Consumes: `validate`（Task 3）、`errorEnvelope`/`pageQuerySchema`/`limitQuerySchema`/`paginationSchema`（Task 2）。
- Produces（`src/schemas/product.schema.js`）：`{ listProductsRequestSchema, productDetailRequestSchema, productSchema, listProductsResponseSchema }`。`productSchema` 供 Task 9（AdminProduct）重用。

- [ ] **Step 1: 於 `tests/products.test.js` 加入新測試**

在檔案內最後一個 `it` 之後、結尾 `});` 之前插入：

```js
  it('should clamp negative or zero page/limit to defaults, like the legacy Math.max/Math.min logic', async () => {
    const res = await request(app).get('/api/products?page=-5&limit=0');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(10);
  });

  it('should clamp limit above 100 down to 100', async () => {
    const res = await request(app).get('/api/products?limit=500');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(100);
  });

  it('should fall back to defaults for non-numeric page/limit', async () => {
    const res = await request(app).get('/api/products?page=abc&limit=xyz');

    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(10);
  });
```

- [ ] **Step 2: 執行測試，確認在現行程式碼下已通過**

```bash
npx vitest run tests/products.test.js
```

Expected: PASS。

- [ ] **Step 3: 建立 `src/schemas/product.schema.js`**

```js
const { z } = require('zod');
const { pageQuerySchema, limitQuerySchema, paginationSchema } = require('./common.schema');

const listProductsQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema
});

const productIdParamsSchema = z.object({ id: z.string().min(1) });

const listProductsRequestSchema = z.object({ body: z.object({}), query: listProductsQuerySchema, params: z.object({}) });
const productDetailRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: productIdParamsSchema });

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  stock: z.number(),
  image_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

const listProductsResponseSchema = z.object({
  products: z.array(productSchema),
  pagination: paginationSchema
});

module.exports = {
  listProductsRequestSchema,
  productDetailRequestSchema,
  productSchema,
  listProductsResponseSchema
};
```

- [ ] **Step 4: 建立 `src/openapi/paths/product.paths.js`**

```js
const { z } = require('zod');
const registry = require('../registry');
const { productSchema, listProductsResponseSchema } = require('../../schemas/product.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'get',
  path: '/api/products',
  tags: ['Products'],
  request: {
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional()
    })
  },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listProductsResponseSchema) } } }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/products/{id}',
  tags: ['Products'],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(productSchema) } } },
    404: { description: '商品不存在' }
  }
});
```

- [ ] **Step 5: 改寫 `src/routes/productRoutes.js`（全檔取代）**

```js
const express = require('express');
const db = require('../database');
const validate = require('../middleware/validate');
const { listProductsRequestSchema, productDetailRequestSchema } = require('../schemas/product.schema');

const router = express.Router();

router.get('/', validate(listProductsRequestSchema), (req, res) => {
  const { page, limit } = req.validated.query;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({
    data: {
      products,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    },
    error: null,
    message: '成功'
  });
});

router.get('/:id', validate(productDetailRequestSchema), (req, res) => {
  const { id } = req.validated.params;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  if (!product) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  res.json({ data: product, error: null, message: '成功' });
});

module.exports = router;
```

- [ ] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/products.test.js
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/schemas/product.schema.js src/openapi/paths/product.paths.js src/routes/productRoutes.js tests/products.test.js
git commit -m "$(cat <<'EOF'
refactor: Product 路由改用 Zod schema + validate middleware，移除手刻驗證與 @openapi 註解

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Admin Order 模組（`adminOrderRoutes.js`）

> 同 Task 4，屬行為保持不變之重構；重點覆蓋 Review Focus 的無效 `status` 過濾情境。

**Files:**
- Create: `src/schemas/adminOrder.schema.js`
- Create: `src/openapi/paths/adminOrder.paths.js`
- Modify: `src/routes/adminOrderRoutes.js`（全檔改寫）
- Test: `tests/adminOrders.test.js`（於結尾插入新 `it()`）

**Interfaces:**
- Consumes: `validate`（Task 3）、`errorEnvelope`/`pageQuerySchema`/`limitQuerySchema`/`paginationSchema`（Task 2）。
- Produces（`src/schemas/adminOrder.schema.js`）：`{ listAdminOrdersRequestSchema, adminOrderDetailRequestSchema, listAdminOrdersResponseSchema, adminOrderDetailResponseSchema }`。

- [ ] **Step 1: 於 `tests/adminOrders.test.js` 加入新測試**

在檔案內最後一個 `it` 之後、結尾 `});` 之前插入：

```js
  it('should ignore an invalid status filter and return all orders', async () => {
    const res = await request(app)
      .get('/api/admin/orders?status=not-a-real-status')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 2: 執行測試，確認在現行程式碼下已通過**

```bash
npx vitest run tests/adminOrders.test.js
```

Expected: PASS。

- [ ] **Step 3: 建立 `src/schemas/adminOrder.schema.js`**

```js
const { z } = require('zod');
const { pageQuerySchema, limitQuerySchema, paginationSchema } = require('./common.schema');

const ORDER_STATUSES = ['pending', 'paid', 'failed'];

const statusQuerySchema = z.preprocess((val) => {
  return ORDER_STATUSES.includes(val) ? val : undefined;
}, z.enum(ORDER_STATUSES).optional());

const listAdminOrdersQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  status: statusQuerySchema
});

const orderIdParamsSchema = z.object({ id: z.string().min(1) });

const listAdminOrdersRequestSchema = z.object({ body: z.object({}), query: listAdminOrdersQuerySchema, params: z.object({}) });
const adminOrderDetailRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: orderIdParamsSchema });

const adminOrderSummarySchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string()
});

const listAdminOrdersResponseSchema = z.object({
  orders: z.array(adminOrderSummarySchema),
  pagination: paginationSchema
});

const adminOrderDetailResponseSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  recipient_address: z.string(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string(),
  items: z.array(z.object({
    id: z.string(),
    product_id: z.string(),
    product_name: z.string(),
    product_price: z.number(),
    quantity: z.number()
  })),
  user: z.object({ name: z.string(), email: z.string() }).nullable()
});

module.exports = {
  listAdminOrdersRequestSchema,
  adminOrderDetailRequestSchema,
  listAdminOrdersResponseSchema,
  adminOrderDetailResponseSchema
};
```

- [ ] **Step 4: 建立 `src/openapi/paths/adminOrder.paths.js`**

```js
const { z } = require('zod');
const registry = require('../registry');
const { listAdminOrdersResponseSchema, adminOrderDetailResponseSchema } = require('../../schemas/adminOrder.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'get',
  path: '/api/admin/orders',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional(),
      status: z.enum(['pending', 'paid', 'failed']).optional()
    })
  },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listAdminOrdersResponseSchema) } } }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/admin/orders/{id}',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(adminOrderDetailResponseSchema) } } },
    404: { description: '訂單不存在' }
  }
});
```

- [ ] **Step 5: 改寫 `src/routes/adminOrderRoutes.js`（全檔取代）**

```js
const express = require('express');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validate = require('../middleware/validate');
const { listAdminOrdersRequestSchema, adminOrderDetailRequestSchema } = require('../schemas/adminOrder.schema');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/', validate(listAdminOrdersRequestSchema), (req, res) => {
  const { page, limit, status } = req.validated.query;
  const offset = (page - 1) * limit;

  let countSql = 'SELECT COUNT(*) as count FROM orders';
  let querySql = 'SELECT * FROM orders';
  const params = [];

  if (status) {
    countSql += ' WHERE status = ?';
    querySql += ' WHERE status = ?';
    params.push(status);
  }

  querySql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const total = db.prepare(countSql).get(...params).count;
  const orders = db.prepare(querySql).all(...params, limit, offset);

  res.json({
    data: { orders, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } },
    error: null,
    message: '成功'
  });
});

router.get('/:id', validate(adminOrderDetailRequestSchema), (req, res) => {
  const { id } = req.validated.params;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);

  if (!order) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '訂單不存在' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(order.user_id);

  res.json({ data: { ...order, items, user: user || null }, error: null, message: '成功' });
});

module.exports = router;
```

- [ ] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/adminOrders.test.js
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/schemas/adminOrder.schema.js src/openapi/paths/adminOrder.paths.js src/routes/adminOrderRoutes.js tests/adminOrders.test.js
git commit -m "$(cat <<'EOF'
refactor: Admin Order 路由改用 Zod schema + validate middleware，移除手刻驗證與 @openapi 註解

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Admin Product 模組（`adminProductRoutes.js`）

> 同 Task 4，屬行為保持不變之重構；重點覆蓋 Review Focus 的空字串/全空白 name 與局部更新情境。

**Files:**
- Create: `src/schemas/adminProduct.schema.js`
- Create: `src/openapi/paths/adminProduct.paths.js`
- Modify: `src/routes/adminProductRoutes.js`（全檔改寫）
- Test: `tests/adminProducts.test.js`（於 `'should update a product'` 之後、`'should delete a product'` 之前插入新 `it()`，因新測試需在 `createdProductId` 被刪除前執行）

**Interfaces:**
- Consumes: `validate`（Task 3）、`errorEnvelope`/`pageQuerySchema`/`limitQuerySchema`/`paginationSchema`（Task 2）、`productSchema`（Task 7）。
- Produces（`src/schemas/adminProduct.schema.js`）：`{ listAdminProductsRequestSchema, createProductRequestSchema, updateProductRequestSchema, deleteProductRequestSchema, listAdminProductsResponseSchema, createProductBodySchema, updateProductBodySchema }`。`createProductBodySchema`/`updateProductBodySchema` 供 `adminProduct.paths.js` 的 `registerPath()` 使用。

- [ ] **Step 1: 於 `tests/adminProducts.test.js` 加入新測試**

在 `it('should update a product', ...)` 之後、`it('should delete a product', ...)` 之前插入：

```js
  it('should reject creating a product with a missing price', async () => {
    const res = await request(app)
      .post('/api/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '缺少價格商品', stock: 10 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should reject updating a product with a whitespace-only name', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: '   ' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should allow a partial update without the name field', async () => {
    const res = await request(app)
      .put(`/api/admin/products/${createdProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stock: 42 });

    expect(res.status).toBe(200);
    expect(res.body.data.stock).toBe(42);
    expect(res.body.data.name).toBe('更新後的花卉商品');
  });
```

- [ ] **Step 2: 執行測試，確認在現行程式碼下已通過**

```bash
npx vitest run tests/adminProducts.test.js
```

Expected: PASS。

- [ ] **Step 3: 建立 `src/schemas/adminProduct.schema.js`**

```js
const { z } = require('zod');
const { pageQuerySchema, limitQuerySchema, paginationSchema } = require('./common.schema');
const { productSchema } = require('./product.schema');

const priceSchema = z.number({ invalid_type_error: 'price 必須為正整數' })
  .int('price 必須為正整數')
  .positive('price 必須為正整數');

const stockSchema = z.number({ invalid_type_error: 'stock 必須為非負整數' })
  .int('stock 必須為非負整數')
  .nonnegative('stock 必須為非負整數');

const listAdminProductsQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema
});

const createProductBodySchema = z.object({
  name: z.string().min(1, 'name 為必填欄位'),
  description: z.string().optional(),
  price: priceSchema,
  stock: stockSchema,
  image_url: z.string().optional()
});

const updateProductBodySchema = z.object({
  name: z.string().refine((v) => v.trim().length > 0, '商品名稱不能為空').optional(),
  description: z.string().optional(),
  price: priceSchema.optional(),
  stock: stockSchema.optional(),
  image_url: z.string().optional()
});

const productIdParamsSchema = z.object({ id: z.string().min(1) });

const listAdminProductsRequestSchema = z.object({ body: z.object({}), query: listAdminProductsQuerySchema, params: z.object({}) });
const createProductRequestSchema = z.object({ body: createProductBodySchema, query: z.object({}), params: z.object({}) });
const updateProductRequestSchema = z.object({ body: updateProductBodySchema, query: z.object({}), params: productIdParamsSchema });
const deleteProductRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: productIdParamsSchema });

const listAdminProductsResponseSchema = z.object({
  products: z.array(productSchema),
  pagination: paginationSchema
});

module.exports = {
  listAdminProductsRequestSchema,
  createProductRequestSchema,
  updateProductRequestSchema,
  deleteProductRequestSchema,
  listAdminProductsResponseSchema,
  createProductBodySchema,
  updateProductBodySchema
};
```

- [ ] **Step 4: 建立 `src/openapi/paths/adminProduct.paths.js`**

```js
const { z } = require('zod');
const registry = require('../registry');
const {
  createProductBodySchema,
  updateProductBodySchema,
  listAdminProductsResponseSchema
} = require('../../schemas/adminProduct.schema');
const { productSchema } = require('../../schemas/product.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'get',
  path: '/api/admin/products',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional()
    })
  },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listAdminProductsResponseSchema) } } },
    401: { description: '未登入' },
    403: { description: '權限不足' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/admin/products',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createProductBodySchema } } } },
  responses: {
    201: { description: '商品新增成功', content: { 'application/json': { schema: errorEnvelope(productSchema) } } },
    400: { description: '參數錯誤' }
  }
});

registry.registerPath({
  method: 'put',
  path: '/api/admin/products/{id}',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: updateProductBodySchema } } }
  },
  responses: {
    200: { description: '商品更新成功', content: { 'application/json': { schema: errorEnvelope(productSchema) } } },
    404: { description: '商品不存在' }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/admin/products/{id}',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: '商品刪除成功', content: { 'application/json': { schema: errorEnvelope(z.null()) } } },
    404: { description: '商品不存在' },
    409: { description: '商品存在未完成訂單，無法刪除' }
  }
});
```

- [ ] **Step 5: 改寫 `src/routes/adminProductRoutes.js`（全檔取代）**

```js
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const adminMiddleware = require('../middleware/adminMiddleware');
const validate = require('../middleware/validate');
const {
  listAdminProductsRequestSchema,
  createProductRequestSchema,
  updateProductRequestSchema,
  deleteProductRequestSchema
} = require('../schemas/adminProduct.schema');

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/', validate(listAdminProductsRequestSchema), (req, res) => {
  const { page, limit } = req.validated.query;
  const offset = (page - 1) * limit;

  const total = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const products = db.prepare('SELECT * FROM products ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);

  res.json({
    data: { products, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } },
    error: null,
    message: '成功'
  });
});

router.post('/', validate(createProductRequestSchema), (req, res) => {
  const { name, description, price, stock, image_url } = req.validated.body;

  const id = uuidv4();
  db.prepare(
    'INSERT INTO products (id, name, description, price, stock, image_url) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, name, description || null, price, stock, image_url || null);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  res.status(201).json({ data: product, error: null, message: '商品新增成功' });
});

router.put('/:id', validate(updateProductRequestSchema), (req, res) => {
  const { id } = req.validated.params;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  const { name, description, price, stock, image_url } = req.validated.body;

  const updated = {
    name: name !== undefined ? name : existing.name,
    description: description !== undefined ? description : existing.description,
    price: price !== undefined ? price : existing.price,
    stock: stock !== undefined ? stock : existing.stock,
    image_url: image_url !== undefined ? image_url : existing.image_url
  };

  db.prepare(
    `UPDATE products SET name = ?, description = ?, price = ?, stock = ?, image_url = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(updated.name, updated.description, updated.price, updated.stock, updated.image_url, id);

  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);

  res.json({ data: product, error: null, message: '商品更新成功' });
});

router.delete('/:id', validate(deleteProductRequestSchema), (req, res) => {
  const { id } = req.validated.params;
  const existing = db.prepare('SELECT id FROM products WHERE id = ?').get(id);

  if (!existing) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '商品不存在' });
  }

  const pendingOrderCount = db.prepare(
    `SELECT COUNT(*) as count FROM order_items oi
     JOIN orders o ON oi.order_id = o.id
     WHERE oi.product_id = ? AND o.status = 'pending'`
  ).get(id).count;

  if (pendingOrderCount > 0) {
    return res.status(409).json({ data: null, error: 'CONFLICT', message: '此商品存在未完成的訂單，無法刪除' });
  }

  db.prepare('DELETE FROM products WHERE id = ?').run(id);

  res.json({ data: null, error: null, message: '商品刪除成功' });
});

module.exports = router;
```

- [ ] **Step 6: 執行測試，確認全數通過**

```bash
npx vitest run tests/adminProducts.test.js
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add src/schemas/adminProduct.schema.js src/openapi/paths/adminProduct.paths.js src/routes/adminProductRoutes.js tests/adminProducts.test.js
git commit -m "$(cat <<'EOF'
refactor: Admin Product 路由改用 Zod schema + validate middleware，移除手刻驗證與 @openapi 註解

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: `src/openapi/generator.js` + 改寫 `generate-openapi.js` + 刪除 `swagger-config.js`

**Files:**
- Create: `src/openapi/generator.js`
- Modify: `generate-openapi.js`（全檔取代）
- Delete: `swagger-config.js`
- Test: `tests/openapi.generator.test.js`（新檔，純函式測試，不依賴共用 DB 狀態）

**Interfaces:**
- Consumes: `registry`（Task 2）、六個 `src/openapi/paths/*.paths.js`（Task 4～9，透過 require 觸發 `registerPath` 副作用）。
- Produces: `module.exports = { generateDocument }`；`generateDocument()` 回傳完整 OpenAPI 3.0.3 document 物件（含 `openapi`、`info`、`servers`、`paths`、`components`）。Task 11 消費此函式。

- [ ] **Step 1: 寫失敗測試**

建立 `tests/openapi.generator.test.js`：

```js
const { generateDocument } = require('../src/openapi/generator');
const SwaggerParser = require('swagger-parser');

describe('OpenAPI generator', () => {
  it('produces a document that passes swagger-parser validation', async () => {
    const document = generateDocument();
    const validated = await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
    expect(validated).toBeDefined();
  });

  it('includes all six route modules as tags', () => {
    const document = generateDocument();
    const tags = new Set();
    Object.values(document.paths).forEach((methods) => {
      Object.values(methods).forEach((op) => (op.tags || []).forEach((t) => tags.add(t)));
    });
    expect(tags).toEqual(new Set(['Auth', 'Cart', 'Orders', 'Products', 'Admin Orders', 'Admin Products']));
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/openapi.generator.test.js
```

Expected: FAIL（`Cannot find module '../src/openapi/generator'`）。

- [ ] **Step 3: 建立 `src/openapi/generator.js`**

```js
require('./paths/auth.paths');
require('./paths/cart.paths');
require('./paths/order.paths');
require('./paths/product.paths');
require('./paths/adminOrder.paths');
require('./paths/adminProduct.paths');

const { OpenApiGeneratorV3 } = require('@asteasolutions/zod-to-openapi');
const registry = require('./registry');

function generateDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'E-Commerce Demo API',
      version: '1.0.0',
      description: '花卉電商網站 REST API'
    },
    servers: [{ url: 'http://localhost:3001' }]
  });
}

module.exports = { generateDocument };
```

- [ ] **Step 4: 改寫 `generate-openapi.js`（全檔取代）**

```js
const fs = require('fs');
const SwaggerParser = require('swagger-parser');
const { generateDocument } = require('./src/openapi/generator');

(async () => {
  const document = generateDocument();
  // SwaggerParser.validate 會就地解引用/修改輸入物件，故傳入深拷貝以保留原始 document 供寫檔使用
  await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
  fs.writeFileSync('openapi.json', JSON.stringify(document, null, 2));
  console.log('openapi.json generated and validated successfully');
})().catch((err) => {
  console.error('OpenAPI 產生失敗：', err.message);
  process.exit(1);
});
```

- [ ] **Step 5: 刪除 `swagger-config.js`**

```bash
git rm swagger-config.js
```

- [ ] **Step 6: 執行測試，確認通過**

```bash
npx vitest run tests/openapi.generator.test.js
```

Expected: PASS。

- [ ] **Step 7: 手動執行產檔腳本驗證**

```bash
npm run openapi
```

Expected: 印出 `openapi.json generated and validated successfully`，且 `openapi.json` 檔案更新（可用 `git diff openapi.json` 確認內容為新結構）。

- [ ] **Step 8: Commit**

```bash
git add src/openapi/generator.js generate-openapi.js tests/openapi.generator.test.js openapi.json
git commit -m "$(cat <<'EOF'
feat: 新增 OpenAPI generator，改寫 generate-openapi.js 含 swagger-parser 驗證，移除 swagger-config.js

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: `app.js` 掛載 `/openapi.json` 與 `/api-docs`

**Files:**
- Modify: `app.js`
- Test: `tests/openapi.test.js`（新檔，不依賴共用 DB 狀態）

**Interfaces:**
- Consumes: `generateDocument`（Task 10）、`swagger-ui-express`。
- Produces: `GET /openapi.json`（回傳 JSON document）、`GET /api-docs/`（回傳 Swagger UI HTML 頁）。

- [ ] **Step 1: 寫失敗測試**

建立 `tests/openapi.test.js`：

```js
const { app, request } = require('./setup');

describe('OpenAPI docs endpoints', () => {
  it('GET /openapi.json returns a valid OpenAPI document', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths).toHaveProperty('/api/auth/register');
  });

  it('GET /api-docs/ returns the Swagger UI HTML page', async () => {
    const res = await request(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
```

- [ ] **Step 2: 執行測試，確認失敗**

```bash
npx vitest run tests/openapi.test.js
```

Expected: FAIL（`/openapi.json` 與 `/api-docs/` 皆回 404，因尚未掛載路由）。

- [ ] **Step 3: 修改 `app.js`**

在 `app.use('/api/orders', require('./src/routes/orderRoutes'));` 之後、`// Page Routes` 之前插入：

```js
const swaggerUi = require('swagger-ui-express');
const { generateDocument } = require('./src/openapi/generator');

const openapiDocument = generateDocument();

app.get('/openapi.json', (req, res) => {
  res.json(openapiDocument);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));
```

（`const swaggerUi = ...` 與 `const { generateDocument } = ...` 兩行 require 需搬移至檔案頂部與其他 `require` 並列，僅 `const openapiDocument = generateDocument();` 與後續兩行路由掛載留在此插入點。）

- [ ] **Step 4: 執行測試，確認通過**

```bash
npx vitest run tests/openapi.test.js
```

Expected: PASS。

- [ ] **Step 5: 執行全套測試，確認無回歸**

```bash
npm test
```

Expected: 全部測試檔案（含既有 6 個 + 本次新增的 4 個）皆 PASS。

- [ ] **Step 6: Commit**

```bash
git add app.js tests/openapi.test.js
git commit -m "$(cat <<'EOF'
feat: app.js 掛載 GET /openapi.json 與 Swagger UI /api-docs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: 同步文件並歸檔計畫

**Files:**
- Modify: `docs/DEVELOPMENT.md`（第 84-95 行「5. 撰寫 JSDoc」步驟；第 159-213 行「## JSDoc / OpenAPI 格式說明」整節）
- Modify: `docs/ARCHITECTURE.md`（第 10-11 行目錄樹）
- Modify: `docs/README.md`（第 19 行技術棧表格；第 65 行指令表不變，僅確認 `npm run openapi` 說明仍正確）
- Modify: `docs/FEATURES.md`（第 17 行 API 文件狀態列）
- Modify: `docs/CHANGELOG.md`（新增條目）
- Move: `docs/plans/2026-09-27-openapi-migration.md` → `docs/plans/archive/2026-09-27-openapi-migration.md`

**Interfaces:** 無（純文件更新與歸檔）。

- [ ] **Step 1: 更新 `docs/DEVELOPMENT.md` 第 84-95 行**

將原本「5. **撰寫 JSDoc**（用於 OpenAPI 生成）」步驟取代為：

```markdown
5. **定義 Zod schema 並註冊 OpenAPI path**：

```javascript
// src/schemas/yourFeature.schema.js
const { z } = require('zod');
const bodySchema = z.object({ name: z.string().min(1) });
const requestSchema = z.object({ body: bodySchema, query: z.object({}), params: z.object({}) });
module.exports = { bodySchema, requestSchema };

// src/openapi/paths/yourFeature.paths.js
const registry = require('../registry');
const { bodySchema } = require('../../schemas/yourFeature.schema');
registry.registerPath({
  method: 'post',
  path: '/api/your-path',
  tags: ['YourTag'],
  request: { body: { content: { 'application/json': { schema: bodySchema } } } },
  responses: { 200: { description: '成功' } }
});
```

路由檔改用 `validate(requestSchema)` middleware 取代手刻 if 驗證：

```javascript
const validate = require('../middleware/validate');
const { requestSchema } = require('../schemas/yourFeature.schema');

router.post('/', validate(requestSchema), (req, res) => {
  const { name } = req.validated.body;
  // ...
});
```
```

- [ ] **Step 2: 更新 `docs/DEVELOPMENT.md` 第 159-213 行**

將整個「## JSDoc / OpenAPI 格式說明」章節（含「### 範例」「### 標記規則」）標題與內文取代為：

```markdown
## Zod Schema / OpenAPI 格式說明

路由檔案改用 `src/schemas/*.schema.js` 定義 Zod schema，並在 `src/openapi/paths/*.paths.js` 呼叫 `registry.registerPath()` 註冊文件，由 `@asteasolutions/zod-to-openapi` 生成 OpenAPI 3.0.3 規格（見 `npm run openapi`）。

### 範例

```javascript
// src/schemas/example.schema.js
const { z } = require('zod');

const createExampleBodySchema = z.object({
  name: z.string().min(1, 'name 為必填欄位')
});

module.exports = { createExampleBodySchema };
```

```javascript
// src/openapi/paths/example.paths.js
const registry = require('../registry');
const { createExampleBodySchema } = require('../../schemas/example.schema');
const { errorEnvelope } = require('../../schemas/common.schema');
const { z } = require('zod');

registry.registerPath({
  method: 'post',
  path: '/api/examples',
  tags: ['Example'],
  request: { body: { content: { 'application/json': { schema: createExampleBodySchema } } } },
  responses: {
    201: { description: '建立成功', content: { 'application/json': { schema: errorEnvelope(z.object({ id: z.string() })) } } },
    400: { description: '參數錯誤' }
  }
});
```

### 標記規則

- `tags`：功能分類，使用 `[Auth]`、`[Products]`、`[Cart]`、`[Orders]`、`[Admin Products]`、`[Admin Orders]`
- `security`：需認證的端點加上 `security: [{ bearerAuth: [] }]`，購物車端點同時列出 `security: [{ bearerAuth: [] }, { sessionAuth: [] }]`
- `responses`：每個可能的 HTTP 狀態碼都應列出（200/201/400/401/403/404/409）
- 所有回應 schema 必須包含 `data`、`error`、`message` 三個頂層欄位（以 `errorEnvelope(dataSchema)` 包裝）
- `src/openapi/paths/*.js` 只能 require `src/schemas/*` 與 `src/openapi/registry.js`，不得 require 路由檔或 `src/database.js`
```

- [ ] **Step 3: 更新 `docs/ARCHITECTURE.md` 第 10-11 行**

將：

```
├── swagger-config.js               # Swagger/OpenAPI 設定（OpenAPI 3.0.3）
├── generate-openapi.js             # 從 JSDoc 註解生成 openapi.json
```

取代為：

```
├── generate-openapi.js             # 由 src/openapi/generator.js 產生並以 swagger-parser 驗證後寫入 openapi.json
```

（`swagger-config.js` 該行整行移除，因該檔已刪除；其設定併入 `src/openapi/generator.js`。）

- [ ] **Step 4: 更新 `docs/README.md` 第 19 行**

將：

```
| API 文件 | swagger-jsdoc | ^6.2.8 |
```

取代為：

```
| API 文件 | zod + @asteasolutions/zod-to-openapi | 依 package.json |
```

- [ ] **Step 5: 更新 `docs/FEATURES.md` 第 17 行**

將：

```
| API 文件 | ✅ 完成 | Swagger/OpenAPI 生成 |
```

取代為：

```
| API 文件 | ✅ 完成 | Zod + zod-to-openapi 生成 OpenAPI，Swagger UI（/api-docs） |
```

- [ ] **Step 6: 更新 `docs/CHANGELOG.md`**

在 `## [Unreleased]` 區塊內、現有 `### Added` 小節之前，新增一個獨立小節（置於檔案最上方最新變更處）：

```markdown
### Changed
- API 文件與輸入驗證改用 Zod + `@asteasolutions/zod-to-openapi`：新增 `src/schemas/*.schema.js`、`src/openapi/registry.js`、`src/openapi/paths/*.paths.js`、`src/openapi/generator.js`、`src/middleware/validate.js`，取代 `swagger-jsdoc` 與六個路由檔中手刻的 if 驗證
- `generate-openapi.js` 產檔前以 `swagger-parser` 驗證規格合法性
- 新增 `GET /api-docs` Swagger UI 瀏覽頁，`GET /openapi.json` 保留原路徑
```

- [ ] **Step 7: 執行完整驗證**

```bash
npm test
npm run openapi
```

Expected: 兩者皆成功（測試全數 PASS，`openapi.json` 產出且通過 swagger-parser 驗證）。

- [ ] **Step 8: 歸檔計畫檔並 Commit**

```bash
mkdir -p docs/plans/archive
git mv docs/plans/2026-09-27-openapi-migration.md docs/plans/archive/2026-09-27-openapi-migration.md
git add docs/DEVELOPMENT.md docs/ARCHITECTURE.md docs/README.md docs/FEATURES.md docs/CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs: 同步 OpenAPI/Zod 遷移文件並歸檔計畫

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
