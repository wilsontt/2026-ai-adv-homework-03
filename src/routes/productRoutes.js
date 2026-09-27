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
