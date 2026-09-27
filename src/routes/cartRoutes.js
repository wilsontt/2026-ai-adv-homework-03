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
