const { z } = require('zod');

function normalizePage(val) {
  const n = parseInt(val, 10);
  return (Number.isInteger(n) && n >= 1) ? n : 1;
}

function normalizeLimit(val) {
  const n = parseInt(val, 10);
  const base = (Number.isInteger(n) && n !== 0) ? n : 10;
  return Math.max(1, Math.min(100, base));
}

const pageQuerySchema = z.preprocess(normalizePage, z.number().int());
const limitQuerySchema = z.preprocess(normalizeLimit, z.number().int());

const paginationSchema = z.object({
  total: z.number(),
  page: z.number(),
  limit: z.number(),
  totalPages: z.number()
});

const errorEnvelope = (dataSchema) => z.object({
  data: dataSchema,
  error: z.string().nullable(),
  message: z.string()
});

module.exports = {
  pageQuerySchema,
  limitQuerySchema,
  paginationSchema,
  errorEnvelope,
  normalizePage,
  normalizeLimit
};
