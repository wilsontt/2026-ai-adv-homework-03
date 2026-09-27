const { z } = require('zod');
const { pageQuerySchema, limitQuerySchema, paginationSchema } = require('./common.schema');

const ORDER_STATUSES = ['pending', 'paid', 'failed'];

const statusQuerySchema = z.preprocess((val) => {
  return ORDER_STATUSES.includes(val) ? val : undefined;
}, z.enum(ORDER_STATUSES).optional());

const listAdminOrdersQuerySchema = z.object({
  page: pageQuerySchema,
  limit: limitQuerySchema,
  status: statusQuerySchema
});

const orderIdParamsSchema = z.object({ id: z.string().min(1) });

const listAdminOrdersRequestSchema = z.object({ body: z.object({}), query: listAdminOrdersQuerySchema, params: z.object({}) });
const adminOrderDetailRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: orderIdParamsSchema });

const adminOrderSummarySchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string()
});

const listAdminOrdersResponseSchema = z.object({
  orders: z.array(adminOrderSummarySchema),
  pagination: paginationSchema
});

const adminOrderDetailResponseSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  recipient_address: z.string(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string(),
  items: z.array(z.object({
    id: z.string(),
    product_id: z.string(),
    product_name: z.string(),
    product_price: z.number(),
    quantity: z.number()
  })),
  user: z.object({ name: z.string(), email: z.string() }).nullable()
});

module.exports = {
  listAdminOrdersRequestSchema,
  adminOrderDetailRequestSchema,
  listAdminOrdersResponseSchema,
  adminOrderDetailResponseSchema
};
