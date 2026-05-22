const privateNetworkOriginPattern = /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2})(?::\d+)?$/i;

const normalizeOrigin = (origin) => origin.trim().replace(/\/$/, '');

const buildCorsOriginChecker = (frontendOrigins = []) => {
  const allowedOrigins = new Set(frontendOrigins.map(normalizeOrigin).filter(Boolean));

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);

    if (allowedOrigins.has(normalizedOrigin) || privateNetworkOriginPattern.test(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS`));
  };
};

module.exports = { buildCorsOriginChecker };
