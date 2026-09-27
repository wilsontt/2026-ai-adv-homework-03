const { z } = require('zod');
const { pageQuerySchema, limitQuerySchema, paginationSchema } = require('./common.schema');
const { productSchema } = require('./product.schema');

const priceSchema = z.number({ error: 'price 必須為正整數' })
  .int('price 必須為正整數')
  .positive('price 必須為正整數');

const stockSchema = z.number({ error: 'stock 必須為非負整數' })
  .int('stock 必須為非負整數')
  .nonnegative('stock 必須為非負整數');

const listAdminProductsQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema
});

const createProductBodySchema = z.object({
  name: z.string().min(1, 'name 為必填欄位'),
  description: z.string().nullable().optional(),
  price: priceSchema,
  stock: stockSchema,
  image_url: z.string().nullable().optional()
});

const updateProductBodySchema = z.object({
  name: z.string().refine((v) => v.trim().length > 0, '商品名稱不能為空').optional(),
  description: z.string().nullable().optional(),
  price: priceSchema.optional(),
  stock: stockSchema.optional(),
  image_url: z.string().nullable().optional()
});

const productIdParamsSchema = z.object({ id: z.string().min(1) });

const listAdminProductsRequestSchema = z.object({ body: z.object({}), query: listAdminProductsQuerySchema, params: z.object({}) });
const createProductRequestSchema = z.object({ body: createProductBodySchema, query: z.object({}), params: z.object({}) });
const updateProductRequestSchema = z.object({ body: updateProductBodySchema, query: z.object({}), params: productIdParamsSchema });
const deleteProductRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: productIdParamsSchema });

const listAdminProductsResponseSchema = z.object({
  products: z.array(productSchema),
  pagination: paginationSchema
});

module.exports = {
  listAdminProductsRequestSchema,
  createProductRequestSchema,
  updateProductRequestSchema,
  deleteProductRequestSchema,
  listAdminProductsResponseSchema,
  createProductBodySchema,
  updateProductBodySchema
};
