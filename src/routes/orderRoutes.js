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
