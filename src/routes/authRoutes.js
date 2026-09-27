const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../database');
const authMiddleware = require('../middleware/authMiddleware');
const validate = require('../middleware/validate');
const { registerRequestSchema, loginRequestSchema } = require('../schemas/auth.schema');

const router = express.Router();

router.post('/register', validate(registerRequestSchema), (req, res) => {
  const { email, password, name } = req.validated.body;

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({
      data: null,
      error: 'CONFLICT',
      message: 'Email 已被註冊'
    });
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);

  db.prepare(
    'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email, passwordHash, name, 'user');

  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(id);

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.status(201).json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '註冊成功'
  });
});

router.post('/login', validate(loginRequestSchema), (req, res) => {
  const { email, password } = req.validated.body;

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ data: null, error: 'UNAUTHORIZED', message: 'Email 或密碼錯誤' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    data: {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token
    },
    error: null,
    message: '登入成功'
  });
});

router.get('/profile', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?').get(req.user.userId);

  if (!user) {
    return res.status(404).json({ data: null, error: 'NOT_FOUND', message: '使用者不存在' });
  }

  res.json({ data: user, error: null, message: '成功' });
});

module.exports = router;
