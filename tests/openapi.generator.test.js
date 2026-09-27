const { generateDocument } = require('../src/openapi/generator');
const SwaggerParser = require('swagger-parser');

describe('OpenAPI generator', () => {
  it('produces a document that passes swagger-parser validation', async () => {
    const document = generateDocument();
    const validated = await SwaggerParser.validate(JSON.parse(JSON.stringify(document)));
    expect(validated).toBeDefined();
  });

  it('includes all six route modules as tags', () => {
    const document = generateDocument();
    const tags = new Set();
    Object.values(document.paths).forEach((methods) => {
      Object.values(methods).forEach((op) => (op.tags || []).forEach((t) => tags.add(t)));
    });
    expect(tags).toEqual(new Set(['Auth', 'Cart', 'Orders', 'Products', 'Admin Orders', 'Admin Products']));
  });

  it('documents page/limit query params as integer with default/range, reusing the runtime schema (not hand-written strings)', () => {
    const document = generateDocument();
    const params = document.paths['/api/products'].get.parameters;
    const page = params.find((p) => p.name === 'page');
    const limit = params.find((p) => p.name === 'limit');

    expect(page.schema).toMatchObject({ type: 'integer', default: 1, minimum: 1 });
    expect(page.required).toBe(false);
    expect(limit.schema).toMatchObject({ type: 'integer', default: 10, minimum: 1, maximum: 100 });
    expect(limit.required).toBe(false);
  });
});
