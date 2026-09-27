const { z } = require('zod');
const registry = require('../registry');
const {
  addCartBodySchema,
  updateCartBodySchema,
  getCartResponseSchema,
  mutateCartResponseSchema
} = require('../../schemas/cart.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

const cartSecurity = [{ bearerAuth: [] }, { sessionAuth: [] }];

registry.registerPath({
  method: 'get',
  path: '/api/cart',
  tags: ['Cart'],
  security: cartSecurity,
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(getCartResponseSchema) } } },
    401: { description: '未提供有效的登入 Token 或 X-Session-Id' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/cart',
  tags: ['Cart'],
  security: cartSecurity,
  request: { body: { content: { 'application/json': { schema: addCartBodySchema } } } },
  responses: {
    200: { description: '已加入購物車', content: { 'application/json': { schema: errorEnvelope(mutateCartResponseSchema) } } },
    400: { description: '參數缺失或庫存不足' },
    401: { description: '未提供有效的登入 Token 或 X-Session-Id' },
    404: { description: '商品不存在' }
  }
});

registry.registerPath({
  method: 'patch',
  path: '/api/cart/{itemId}',
  tags: ['Cart'],
  security: cartSecurity,
  request: {
    params: z.object({ itemId: z.string() }),
    body: { content: { 'application/json': { schema: updateCartBodySchema } } }
  },
  responses: {
    200: { description: '數量已更新', content: { 'application/json': { schema: errorEnvelope(mutateCartResponseSchema) } } },
    400: { description: '庫存不足' },
    401: { description: '未提供有效的登入 Token 或 X-Session-Id' },
    404: { description: '購物車項目不存在' }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/cart/{itemId}',
  tags: ['Cart'],
  security: cartSecurity,
  request: { params: z.object({ itemId: z.string() }) },
  responses: {
    200: { description: '已從購物車移除', content: { 'application/json': { schema: errorEnvelope(z.null()) } } },
    401: { description: '未提供有效的登入 Token 或 X-Session-Id' },
    404: { description: '購物車項目不存在' }
  }
});
