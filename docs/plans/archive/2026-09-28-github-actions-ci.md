# GitHub Actions 自動化測試 Implementation Plan

**Goal:** 新增 `.github/workflows/test.yml`，讓專案在程式碼更新時自動執行 Unit Test 與 Integration Test。

**Architecture:** 單一 workflow、單一 job，依序執行 `npm run test:unit`、`npm run test:integration` 兩個明確步驟；不含 Playwright E2E，不啟動額外服務。

**Tech Stack:** GitHub Actions（`actions/checkout@v4`、`actions/setup-node@v4`），Node.js 20.x，既有 Vitest 測試套件不變。

**Spec:** 使用者提供的「挑戰三：GitHub Actions 自動化測試」需求（見下方 User Story），需求已完整明確，未使用 brainstorming 流程，直接依規格實作。

## Global Constraints

- 不執行 `npm run test:e2e`，不啟動任何前端/後端服務（依需求明文排除）。
- 只新增 CI 設定檔，不修改既有測試程式碼或 `package.json` scripts（`test:unit`/`test:integration` 已存在於 `feature/integration-e2e-postman` 分支）。

## User Story

作為維護者，我希望每次推送程式碼或開 PR 時，CI 自動跑過 Unit Test 與 Integration Test，避免回歸未被發現。

## 執行紀錄（全部完成）

| 項目 | 狀態 | 說明 |
|------|------|------|
| 建立 `.github/workflows/test.yml` | ✅ 完成 | `on: push, pull_request` 觸發；`actions/checkout@v4` + `actions/setup-node@v4`（Node 20.x，`cache: npm`）+ `npm ci` + 兩個明確命名步驟 `Run Unit Tests`/`Run Integration Tests` |
| YAML 格式驗證 | ✅ 完成 | 以 `js-yaml` 本機解析成功，結構符合 GitHub Actions schema |
| Unit Test 可成功執行 | ✅ 完成 | `npm run test:unit` 本機與乾淨 `git worktree`（無 `.env`）皆通過（11/11） |
| Integration Test 可成功執行 | ✅ 完成 | 見下方關鍵發現與修正 |

**關鍵發現（RED→GREEN 驗證）：** 用 `git worktree` 建立一份不含 `.gitignore` 排除之 `.env` 的乾淨檢出，模擬 GitHub Actions 的 fresh checkout，直接跑 `npm run test:integration`：3/4 測試失敗（`TypeError: Cannot read properties of null (reading 'token')`），原因是 `src/routes/authRoutes.js`／`src/middleware/authMiddleware.js` 的 `jwt.sign()`/`jwt.verify()` 讀取 `process.env.JWT_SECRET` 沒有預設值，CI 上不存在 `.env` 時該值為 `undefined`，`jwt.sign()` 會直接拋出例外（`secretOrPrivateKey must have a value`），導致 `tests/setup.js` 的 `registerUser()`/`getAdminToken()` 輔助函式取回 `null`。本機測試之所以一直通過，是因為本機 `.env` 檔案（未納入版控）提供了這個值，掩蓋了 CI 環境會缺少它的事實。

**修正：** 在 workflow 的「Run Integration Tests」步驟加上 `env: JWT_SECRET: ci-test-jwt-secret-not-for-production`——此為僅供 CI 內簽發測試用 JWT 的隨機字串，非任何正式環境密鑰，不需要透過 GitHub Secrets 管理。加上後於同一份乾淨 worktree 重跑，4/4 通過；`test:unit` 因不會載入 `app.js`／`.env`，全程不受影響，11/11 通過。

其餘環境變數（`ADMIN_EMAIL`、`ADMIN_PASSWORD`、`ECPAY_*`、`BASE_URL`、`FRONTEND_URL`）在程式碼中皆有 `||` 預設值，CI 上缺少 `.env` 不影響其行為，故未在 workflow 中額外設定。

**分支選擇：** 本計畫從 `feature/integration-e2e-postman`（尚未合併 main）切出 `feature/github-actions-ci` 分支，而非直接從 `main` 切出，因為 `npm run test:integration` 腳本目前只存在於前者；待該分支合併 main 後，此分支的基底關係會自然理順。

## 驗證

```bash
# 本機直接驗證兩個 CI 會跑的指令
npm run test:unit
npm run test:integration

# 以乾淨 git worktree（無 .env）模擬 CI fresh checkout
git worktree add --detach /tmp/ci-sim HEAD
cd /tmp/ci-sim && npm ci
npm run test:unit                                    # 通過，不受影響
npm run test:integration                             # 修正前失敗、修正後通過
```
