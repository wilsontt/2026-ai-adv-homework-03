const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse({ body: req.body, query: req.query, params: req.params });

  if (!result.success) {
    return res.status(400).json({
      data: null,
      error: 'VALIDATION_ERROR',
      message: result.error.issues.map((issue) => issue.message).join('; ')
    });
  }

  req.validated = result.data;
  next();
};

module.exports = validate;
