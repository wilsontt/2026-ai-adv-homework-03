const { OpenAPIRegistry } = require('@asteasolutions/zod-to-openapi');

const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT'
});

registry.registerComponent('securitySchemes', 'sessionAuth', {
  type: 'apiKey',
  in: 'header',
  name: 'X-Session-Id'
});

module.exports = registry;
