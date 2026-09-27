const { z } = require('zod');
const registry = require('../registry');
const { listAdminOrdersResponseSchema, adminOrderDetailResponseSchema } = require('../../schemas/adminOrder.schema');
const { errorEnvelope, pageQuerySchema, limitQuerySchema } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'get',
  path: '/api/admin/orders',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: pageQuerySchema.optional(),
      limit: limitQuerySchema.optional(),
      status: z.enum(['pending', 'paid', 'failed']).optional()
    })
  },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listAdminOrdersResponseSchema) } } },
    401: { description: '未登入' },
    403: { description: '權限不足' }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/admin/orders/{id}',
  tags: ['Admin Orders'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(adminOrderDetailResponseSchema) } } },
    401: { description: '未登入' },
    403: { description: '權限不足' },
    404: { description: '訂單不存在' }
  }
});
