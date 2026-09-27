const { z } = require('zod');
const {
  pageQuerySchema,
  limitQuerySchema,
  normalizePage,
  normalizeLimit,
  errorEnvelope
} = require('../src/schemas/common.schema');

describe('common schema helpers', () => {
  it('normalizePage falls back to 1 for invalid input, matching legacy Math.max(1, parseInt(x)||1)', () => {
    expect(normalizePage(undefined)).toBe(1);
    expect(normalizePage('abc')).toBe(1);
    expect(normalizePage('0')).toBe(1);
    expect(normalizePage('-5')).toBe(1);
    expect(normalizePage('3')).toBe(3);
  });

  it('normalizeLimit clamps to [1,100] and falls back to 10, matching legacy Math.max(1, Math.min(100, parseInt(x)||10))', () => {
    expect(normalizeLimit(undefined)).toBe(10);
    expect(normalizeLimit('abc')).toBe(10);
    expect(normalizeLimit('0')).toBe(10);
    expect(normalizeLimit('-5')).toBe(1);
    expect(normalizeLimit('500')).toBe(100);
    expect(normalizeLimit('50')).toBe(50);
  });

  it('pageQuerySchema/limitQuerySchema apply the same normalization via zod', () => {
    expect(pageQuerySchema.parse(undefined)).toBe(1);
    expect(limitQuerySchema.parse('500')).toBe(100);
  });
});

describe('errorEnvelope', () => {
  it('wraps a data schema with { data, error, message }', () => {
    const schema = errorEnvelope(z.object({ id: z.string() }));
    const result = schema.safeParse({ data: { id: 'x' }, error: null, message: 'ok' });
    expect(result.success).toBe(true);
  });
});

describe('registry', () => {
  it('registers bearerAuth and sessionAuth security schemes', () => {
    const { OpenApiGeneratorV3 } = require('@asteasolutions/zod-to-openapi');
    const registry = require('../src/openapi/registry');
    const generator = new OpenApiGeneratorV3(registry.definitions);
    const document = generator.generateDocument({
      openapi: '3.0.3',
      info: { title: 'test', version: '0.0.0' }
    });
    expect(document.components.securitySchemes.bearerAuth).toEqual({
      type: 'http',
      scheme: 'bearer',
      bearerFormat: 'JWT'
    });
    expect(document.components.securitySchemes.sessionAuth).toEqual({
      type: 'apiKey',
      in: 'header',
      name: 'X-Session-Id'
    });
  });
});
