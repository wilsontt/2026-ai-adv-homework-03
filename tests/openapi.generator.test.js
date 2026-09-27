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
});
