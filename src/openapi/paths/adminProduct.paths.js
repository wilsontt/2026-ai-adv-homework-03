const { z } = require('zod');
const registry = require('../registry');
const {
  createProductBodySchema,
  updateProductBodySchema,
  listAdminProductsResponseSchema
} = require('../../schemas/adminProduct.schema');
const { productSchema } = require('../../schemas/product.schema');
const { errorEnvelope, pageQuerySchema, limitQuerySchema } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'get',
  path: '/api/admin/products',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: {
    query: z.object({
      page: pageQuerySchema.optional(),
      limit: limitQuerySchema.optional()
    })
  },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listAdminProductsResponseSchema) } } },
    401: { description: '未登入' },
    403: { description: '權限不足' }
  }
});

registry.registerPath({
  method: 'post',
  path: '/api/admin/products',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: { body: { content: { 'application/json': { schema: createProductBodySchema } } } },
  responses: {
    201: { description: '商品新增成功', content: { 'application/json': { schema: errorEnvelope(productSchema) } } },
    400: { description: '參數錯誤' }
  }
});

registry.registerPath({
  method: 'put',
  path: '/api/admin/products/{id}',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: updateProductBodySchema } } }
  },
  responses: {
    200: { description: '商品更新成功', content: { 'application/json': { schema: errorEnvelope(productSchema) } } },
    400: { description: '參數錯誤' },
    404: { description: '商品不存在' }
  }
});

registry.registerPath({
  method: 'delete',
  path: '/api/admin/products/{id}',
  tags: ['Admin Products'],
  security: [{ bearerAuth: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: '商品刪除成功', content: { 'application/json': { schema: errorEnvelope(z.null()) } } },
    404: { description: '商品不存在' },
    409: { description: '商品存在未完成訂單，無法刪除' }
  }
});
