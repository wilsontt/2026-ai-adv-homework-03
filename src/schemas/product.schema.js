const { z } = require('zod');
const { pageQuerySchema, limitQuerySchema, paginationSchema } = require('./common.schema');

const listProductsQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema
});

const productIdParamsSchema = z.object({ id: z.string().min(1) });

const listProductsRequestSchema = z.object({ body: z.object({}), query: listProductsQuerySchema, params: z.object({}) });
const productDetailRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: productIdParamsSchema });

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: z.number(),
  stock: z.number(),
  image_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string()
});

const listProductsResponseSchema = z.object({
  products: z.array(productSchema),
  pagination: paginationSchema
});

module.exports = {
  listProductsRequestSchema,
  productDetailRequestSchema,
  productSchema,
  listProductsResponseSchema
};
