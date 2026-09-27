const { test, expect } = require('@playwright/test');

test('full checkout flow: login -> add to cart -> checkout -> ECPay payment -> paid', async ({ page }) => {
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

  // 6. 前往綠界測試環境（上一步 waitForURL 已確認抵達）
  // 7. 選擇「網路 ATM」
  await page.locator('text=網路ATM').first().click();

  // 8. 選擇「台灣土地銀行」
  // 用 select:visible 而非裸 select，避免選到信用卡分期用的隱藏 #selectBuyerInstallments
  await page.locator('select:visible').first().selectOption({ label: '台灣土地銀行' });

  // 9. 點擊「前往付款」
  // 用網路ATM分頁專屬的 #WebATMPaySubmit id，避免各付款方式分頁重複的「前往付款」文字造成 strict mode violation
  await page.locator('#WebATMPaySubmit').click();

  // 10. 關閉提示視窗（綠界提醒將跳轉至銀行頁面的 modal，非彈出視窗，同一頁內顯示）
  await page.getByText('關閉', { exact: true }).click();

  // 11. 在土地銀行測試頁面點擊 Save
  // 關閉提示視窗後會導向 pay-stage.ecpay.com.tw 的土地銀行模擬付款頁，RC/MSG 等欄位已預填交易成功
  await page.waitForURL('**/pay-stage.ecpay.com.tw/**', { timeout: 15000 });
  await page.locator('input[value="Save"]').click();

  // 12. 等待綠界顯示付款成功
  await page.waitForURL('**/payment-stage.ecpay.com.tw/**', { timeout: 15000 });
  await expect(page.getByText('付款成功', { exact: true })).toBeVisible();

  // 13. 點擊「返回商店」
  await page.getByText('返回商店', { exact: true }).click();
  await page.waitForURL('**/orders/*');

  // 14. 驗證訂單顯示「已付款」
  // 返回商店會帶 ?payment=pending 導回訂單詳情頁；該頁 onMounted 偵測到此參數會自動呼叫
  // check-payment API 向綠界查詢並更新狀態，屬非同步流程，故給予較長的斷言逾時
  await expect(page.getByTestId('order-status')).toHaveText('已付款', { timeout: 15000 });

  // 15. 驗證訂單狀態為 paid（不只看畫面文字，直接打 API 確認底層狀態）
  const orderId = new URL(page.url()).pathname.split('/').pop();
  const apiRes = await page.evaluate(async (id) => {
    const token = localStorage.getItem('flower_token');
    const res = await fetch('/api/orders/' + id, { headers: { Authorization: 'Bearer ' + token } });
    return res.json();
  }, orderId);
  expect(apiRes.data.status).toBe('paid');

  // 16. 需要有付款，並返回站點後的成功截圖
  await page.screenshot({ path: `test-results/e2e-payment-success-${Date.now()}.png`, fullPage: true });
});
