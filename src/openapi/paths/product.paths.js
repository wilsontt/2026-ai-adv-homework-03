const { z } = require('zod');
const registry = require('../registry');
const { productSchema, listProductsResponseSchema } = require('../../schemas/product.schema');
const { errorEnvelope } = require('../../schemas/common.schema');

registry.registerPath({
  method: 'get',
  path: '/api/products',
  tags: ['Products'],
  request: {
    query: z.object({
      page: z.string().optional(),
      limit: z.string().optional()
    })
  },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(listProductsResponseSchema) } } }
  }
});

registry.registerPath({
  method: 'get',
  path: '/api/products/{id}',
  tags: ['Products'],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: '成功', content: { 'application/json': { schema: errorEnvelope(productSchema) } } },
    404: { description: '商品不存在' }
  }
});
