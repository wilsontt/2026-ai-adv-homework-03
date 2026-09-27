const { app, request } = require('./setup');

describe('OpenAPI docs endpoints', () => {
  it('GET /openapi.json returns a valid OpenAPI document', async () => {
    const res = await request(app).get('/openapi.json');

    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.0.3');
    expect(res.body.paths).toHaveProperty('/api/auth/register');
  });

  it('GET /api-docs/ returns the Swagger UI HTML page', async () => {
    const res = await request(app).get('/api-docs/');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});
