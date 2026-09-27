const { z } = require('zod');
const { SHIPPING_METHODS } = require('../utils/shipping');

const SHIPPING_METHOD_VALUES = Object.keys(SHIPPING_METHODS);

const createOrderBodySchema = z.object({
  recipientName: z.string().min(1, '收件人姓名、Email 和地址為必填欄位'),
  recipientEmail: z.string().min(1, '收件人姓名、Email 和地址為必填欄位').email('Email 格式不正確'),
  recipientAddress: z.string().min(1, '收件人姓名、Email 和地址為必填欄位'),
  shippingMethod: z.enum(SHIPPING_METHOD_VALUES, { error: 'shippingMethod 必須為 home_delivery 或 convenience_store' }),
  isRemoteArea: z.boolean().optional().default(false),
  isRushDelivery: z.boolean().optional().default(false)
});

const payOrderBodySchema = z.object({
  action: z.enum(['success', 'fail'], { error: 'action 必須為 success 或 fail' })
});

const orderIdParamsSchema = z.object({ id: z.string().min(1) });

const createOrderRequestSchema = z.object({ body: createOrderBodySchema, query: z.object({}), params: z.object({}) });
const listOrdersRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: z.object({}) });
const orderDetailRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: orderIdParamsSchema });
const payOrderRequestSchema = z.object({ body: payOrderBodySchema, query: z.object({}), params: orderIdParamsSchema });
const checkPaymentRequestSchema = z.object({ body: z.object({}), query: z.object({}), params: orderIdParamsSchema });

const orderItemBriefSchema = z.object({
  product_name: z.string(),
  product_price: z.number(),
  quantity: z.number()
});

const orderItemDetailSchema = z.object({
  id: z.string(),
  order_id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  product_price: z.number(),
  quantity: z.number()
});

const orderRecordSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  subtotal: z.number(),
  shipping_method: z.string(),
  shipping_fee: z.number(),
  is_remote_area: z.boolean(),
  is_rush_delivery: z.boolean(),
  total_amount: z.number(),
  status: z.string(),
  created_at: z.string(),
  items: z.array(orderItemBriefSchema)
});

const orderDetailSchema = z.object({
  id: z.string(),
  order_no: z.string(),
  user_id: z.string(),
  recipient_name: z.string(),
  recipient_email: z.string(),
  recipient_address: z.string(),
  subtotal: z.number(),
  shipping_method: z.string(),
  shipping_fee: z.number(),
  is_remote_area: z.boolean(),
  is_rush_delivery: z.boolean(),
  total_amount: z.number(),
  status: z.string(),
  merchant_trade_no: z.string().nullable(),
  created_at: z.string(),
  items: z.array(orderItemDetailSchema)
});

const listOrdersResponseSchema = z.object({
  orders: z.array(z.object({
    id: z.string(),
    order_no: z.string(),
    total_amount: z.number(),
    status: z.string(),
    created_at: z.string()
  }))
});

module.exports = {
  createOrderBodySchema,
  payOrderBodySchema,
  createOrderRequestSchema,
  listOrdersRequestSchema,
  orderDetailRequestSchema,
  payOrderRequestSchema,
  checkPaymentRequestSchema,
  orderRecordSchema,
  orderDetailSchema,
  listOrdersResponseSchema
};
