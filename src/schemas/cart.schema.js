const { z } = require('zod');

const quantitySchema = z.coerce
  .number({ error: 'quantity 必須為正整數' })
  .int('quantity 必須為正整數')
  .positive('quantity 必須為正整數');

const addCartBodySchema = z.object({
  productId: z.string().min(1, 'productId 為必填欄位'),
  quantity: quantitySchema.optional().default(1)
});

const updateCartBodySchema = z.object({
  quantity: quantitySchema
});

const cartItemIdParamsSchema = z.object({ itemId: z.string().min(1) });

const getCartRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: z.object({}) });
const addCartRequestSchema = z.object({ body: addCartBodySchema, query: z.object({}), params: z.object({}) });
const updateCartRequestSchema = z.object({ body: updateCartBodySchema, query: z.object({}), params: cartItemIdParamsSchema });
const deleteCartRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: cartItemIdParamsSchema });

const cartProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  stock: z.number(),
  image_url: z.string().nullable()
});

const cartItemResponseSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  quantity: z.number(),
  product: cartProductSchema
});

const getCartResponseSchema = z.object({
  items: z.array(cartItemResponseSchema),
  total: z.number()
});

const mutateCartResponseSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  quantity: z.number()
});

module.exports = {
  addCartBodySchema,
  updateCartBodySchema,
  getCartRequestSchema,
  addCartRequestSchema,
  updateCartRequestSchema,
  deleteCartRequestSchema,
  getCartResponseSchema,
  mutateCartResponseSchema
};
