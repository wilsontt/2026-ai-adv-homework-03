const { z } = require('zod');
const validate = require('../src/middleware/validate');

function mockRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('validate middleware', () => {
  const schema = z.object({
    body: z.object({ name: z.string().min(1) }),
    query: z.object({}),
    params: z.object({})
  });

  it('calls next() and sets req.validated when input is valid', () => {
    const req = { body: { name: 'flower' }, query: {}, params: {} };
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.validated).toEqual({ body: { name: 'flower' }, query: {}, params: {} });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responds 400 VALIDATION_ERROR and does not call next() when input is invalid', () => {
    const req = { body: { name: '' }, query: {}, params: {} };
    const res = mockRes();
    const next = vi.fn();

    validate(schema)(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ data: null, error: 'VALIDATION_ERROR' })
    );
  });

  it('joins multiple field errors into one "; "-separated message string', () => {
    const multiFieldSchema = z.object({
      body: z.object({
        name: z.string().min(1, 'name 為必填欄位'),
        age: z.number({ error: 'age 必須為數字' })
      }),
      query: z.object({}),
      params: z.object({})
    });
    const req = { body: { name: '', age: 'not-a-number' }, query: {}, params: {} };
    const res = mockRes();
    const next = vi.fn();

    validate(multiFieldSchema)(req, res, next);

    const [[payload]] = res.json.mock.calls;
    expect(payload.message).toBe('name 為必填欄位; age 必須為數字');
  });
});
