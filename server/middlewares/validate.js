/** Validates `req[source]` with a Zod schema and replaces it with the parsed value. */
export const validate = (schema, source = 'body') => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    return next(result.error);
  }

  // req.query is a getter in Express 5; assign defensively.
  if (source === 'query') {
    Object.defineProperty(req, 'validatedQuery', { value: result.data, writable: true, configurable: true });
  } else {
    req[source] = result.data;
  }
  return next();
};
