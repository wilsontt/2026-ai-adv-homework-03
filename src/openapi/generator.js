require('./paths/auth.paths');
require('./paths/cart.paths');
require('./paths/order.paths');
require('./paths/product.paths');
require('./paths/adminOrder.paths');
require('./paths/adminProduct.paths');

const { OpenApiGeneratorV3 } = require('@asteasolutions/zod-to-openapi');
const registry = require('./registry');

function generateDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);
  return generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'E-Commerce Demo API',
      version: '1.0.0',
      description: '花卉電商網站 REST API'
    },
    servers: [{ url: 'http://localhost:3001' }]
  });
}

module.exports = { generateDocument };
