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
