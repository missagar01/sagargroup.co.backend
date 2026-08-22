const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;

  res.status(statusCode).json({
    error: err.message || 'Internal server error',
    ...(err.details ? { details: err.details } : {}),
  });
};

module.exports = { errorHandler };
