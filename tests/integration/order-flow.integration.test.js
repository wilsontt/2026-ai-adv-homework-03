const { app, request, registerUser, getAdminToken } = require('../setup');
const db = require('../../src/database');

describe('Order creation flow (integration, in-memory DB)', () => {
  it('confirms this suite runs against an isolated in-memory database', () => {
    expect(process.env.DATABASE_PATH).toBe(':memory:');
    // 不只檢查環境變數有沒有被注入，直接斷言 better-sqlite3 連線本身確實是記憶體資料庫，
    // 避免 src/database.js 日後改寫成忽略 DATABASE_PATH 時，這個測試卻矇混過關
    expect(db.memory).toBe(true);
    expect(db.name).toBe(':memory:');
  });

  it('completes the full flow: register -> get products -> add to cart -> create order, with correct DB writes', async () => {
    // 1. 註冊會員並登入
    const { token, user } = await registerUser();
    expect(token).toBeTruthy();

    // 2. 取得商品資料
    const productsRes = await request(app).get('/api/products');
    expect(productsRes.status).toBe(200);
    expect(productsRes.body.data.products.length).toBeGreaterThan(0);
    // price * 2 必須低於免運門檻（1,500），確保這筆測試穩定驗證「有收基本運費」的一般情境，
    // 不會因為選到的商品乘以數量後意外觸發滿額免運規則而誤判
    const product = productsRes.body.data.products.find((p) => p.price * 2 < 1500 && p.stock >= 2);
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
