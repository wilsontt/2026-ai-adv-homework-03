const registry = require('../registry');
const {
  registerBodySchema,
  loginBodySchema,
  authTokenResponseSchema,
  profileResponseSchema
} = require('../../schemas/auth.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'post',
  path: '/api/auth/register',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: registerBodySchema } } } },
  responses: {
    201: { description: '註冊成功', content: { 'application/json': { schema: errorEnvelope(authTokenResponseSchema) } } },
    400: { description: '參數缺失或格式錯誤' },
    409: { description: 'Email 已被註冊' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/auth/login',
  tags: ['Auth'],
  request: { body: { content: { 'application/json': { schema: loginBodySchema } } } },
  responses: {
    200: { description: '登入成功', content: { 'application/json': { schema: errorEnvelope(authTokenResponseSchema) } } },
    400: { description: '參數缺失' },
    401: { description: 'Email 或密碼錯誤' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/auth/profile',
  tags: ['Auth'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(profileResponseSchema) } } },
    401: { description: '未登入或 token 無效' }
  }
});
