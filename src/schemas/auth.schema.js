const { z } = require('zod');

const registerBodySchema = z.object({
  email: z.string().min(1, 'email、password、name 為必填欄位').email('Email 格式不正確'),
  password: z.string().min(6, '密碼至少需要 6 個字元'),
  name: z.string().min(1, 'email、password、name 為必填欄位')
});

const loginBodySchema = z.object({
  email: z.string().min(1, 'email 和 password 為必填欄位'),
  password: z.string().min(1, 'email 和 password 為必填欄位')
});

const registerRequestSchema = z.object({ body: registerBodySchema, query: z.object({}), params: z.object({}) });
const loginRequestSchema = z.object({ body: loginBodySchema, query: z.object({}), params: z.object({}) });

const userPublicSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string()
});

const authTokenResponseSchema = z.object({
  user: userPublicSchema,
  token: z.string()
});

const profileResponseSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string(),
  role: z.string(),
  created_at: z.string()
});

module.exports = {
  registerBodySchema,
  loginBodySchema,
  registerRequestSchema,
  loginRequestSchema,
  authTokenResponseSchema,
  profileResponseSchema
};
