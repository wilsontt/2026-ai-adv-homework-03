const { app, request, registerUser } = require('./setup');

describe('Cart API', () => {
  const sessionId = 'test-session-' + Date.now();
  let productId;
  let cartItemId;
  let userToken;

  beforeAll(async () => {
    // Get a product id from the product list
    const res = await request(app).get('/api/products');
    productId = res.body.data.products[0].id;
  });

  it('should add product to cart (guest mode)', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 1 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body).toHaveProperty('message');
    expect(res.body.data).toHaveProperty('id');
    expect(res.body.data).toHaveProperty('product_id', productId);
    expect(res.body.data).toHaveProperty('quantity');

    cartItemId = res.body.data.id;
  });

  it('should get cart (guest mode)', async () => {
    const res = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('should update cart item quantity (guest mode)', async () => {
    const res = await request(app)
      .patch(`/api/cart/${cartItemId}`)
      .set('X-Session-Id', sessionId)
      .send({ quantity: 3 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('quantity', 3);
  });

  it('should remove cart item (guest mode)', async () => {
    const res = await request(app)
      .delete(`/api/cart/${cartItemId}`)
      .set('X-Session-Id', sessionId);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('error', null);

    // Verify cart is empty
    const cartRes = await request(app)
      .get('/api/cart')
      .set('X-Session-Id', sessionId);
    expect(cartRes.body.data.items.length).toBe(0);
  });

  it('should add product to cart (authenticated mode)', async () => {
    const { token } = await registerUser();
    userToken = token;

    const res = await request(app)
      .post('/api/cart')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ productId, quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('error', null);
    expect(res.body.data).toHaveProperty('product_id', productId);
  });

  it('should fail to add non-existent product to cart', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId: 'non-existent-product-id', quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('data', null);
    expect(res.body).toHaveProperty('error');
    expect(res.body.error).not.toBeNull();
  });

  it('should return 401 (not 400) when dualAuth fails even with an invalid body', async () => {
    const res = await request(app)
      .post('/api/cart')
      .send({});

    expect(res.status).toBe(401);
  });

  it('should fail to add to cart with a non-numeric quantity, using the custom Chinese message', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: 'abc' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
    expect(res.body.message).toContain('quantity 必須為正整數');
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

  it('should fail to add to cart with a negative quantity', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: -3 });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to add to cart with a boolean quantity (must not coerce true to 1)', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: true });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should fail to add to cart with a scientific-notation quantity string (must not coerce "1e2" to 100)', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: '1e2' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error', 'VALIDATION_ERROR');
  });

  it('should accept a plain digit-string quantity', async () => {
    const res = await request(app)
      .post('/api/cart')
      .set('X-Session-Id', sessionId)
      .send({ productId, quantity: '3' });

    expect(res.status).toBe(200);
    expect(res.body.data.quantity).toBeGreaterThanOrEqual(3);
  });
});
