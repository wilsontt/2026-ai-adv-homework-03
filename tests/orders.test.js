const { app, request, registerUser } = require('./setup');

describe('Orders API', () => {
  let userToken;
  let productId;
  let orderId;

  beforeAll(async () => {
    // Register a user for order tests
    const { token } = await registerUser();
    userToken = token;

    // Get a product id
    const prodRes = await request(app).get('/api/products');
    productId = prodRes.body.data.products[0].id;

    // Add product to cart
    await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 1 });
  });

  it('should create an order from cart', async () => {
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery'
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('total_amount');
    expect(res.body.data).toHaveProperty('status', 'pending');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);

    orderId = res.body.data.id;
  });

  it('should fail to create order with empty cart', async () => {
    // The cart was already cleared by the previous order
    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
        shippingMethod: 'home_delivery'
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

  it('should fail to create order without auth', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({
        recipientName: '測試收件人',
        recipientEmail: 'recipient@example.com',
        recipientAddress: '台北市測試路 123 號',
      });

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should get order list', async () => {
    const res = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('orders');
    expect(Array.isArray(res.body.data.orders)).toBe(true);
    expect(res.body.data.orders.length).toBeGreaterThan(0);
  });

  it('should get order detail', async () => {
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('id', orderId);
    expect(res.body.data).toHaveProperty('order_no');
    expect(res.body.data).toHaveProperty('items');
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('should return 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/orders/non-existent-order-id')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
  });

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

  it('should fail to pay with an invalid action value, using the custom Chinese message', async () => {
    const res = await request(app)
      .patch(`/api/orders/${orderId}/pay`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ action: 'not-a-valid-action' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
    expect(res.body.message).toContain('action 必須為 success 或 fail');
  });

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
});
