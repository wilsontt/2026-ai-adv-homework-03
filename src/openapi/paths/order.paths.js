const { z } = require('zod');
const registry = require('../registry');
const {
  createOrderBodySchema,
  payOrderBodySchema,
  orderRecordSchema,
  orderDetailSchema,
  listOrdersResponseSchema
} = require('../../schemas/order.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

const idParam = z.object({ id: z.string() });

registry.registerPath({
  method: 'post',
  path: '/api/orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createOrderBodySchema } } } },
  responses: {
    201: { description: '訂單建立成功', content: { 'application/json': { schema: errorEnvelope(orderRecordSchema) } } },
    400: { description: '購物車為空或庫存不足或收件資訊缺失或配送方式無效' },
    401: { description: '未登入或 token 無效' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/orders',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listOrdersResponseSchema) } } },
    401: { description: '未登入或 token 無效' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/orders/{id}',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(orderDetailSchema) } } },
    401: { description: '未登入或 token 無效' },
    404: { description: '訂單不存在' }
  }
});

registry.registerPath({
  method: 'patch',
  path: '/api/orders/{id}/pay',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: idParam, body: { content: { 'application/json': { schema: payOrderBodySchema } } } },
  responses: {
    200: { description: '付款狀態更新成功', content: { 'application/json': { schema: errorEnvelope(orderRecordSchema) } } },
    400: { description: 'action 無效或訂單狀態不是 pending' },
    401: { description: '未登入或 token 無效' },
    404: { description: '訂單不存在' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/orders/{id}/check-payment',
  tags: ['Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: idParam },
  responses: {
    200: { description: '查詢成功' },
    400: { description: '訂單狀態不是 pending' },
    401: { description: '未登入或 token 無效' },
    404: { description: '訂單不存在' }
  }
});
