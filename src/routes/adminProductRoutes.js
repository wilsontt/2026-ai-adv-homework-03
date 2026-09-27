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

// All admin product routes require auth + admin
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

  // Check if product is in any pending orders
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
