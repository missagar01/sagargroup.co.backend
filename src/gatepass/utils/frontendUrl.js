const DEFAULT_PROTOCOL = "https";

const normalizeBaseUrl = (value) => {
    if (typeof value !== "string") {
        return "";
    }

    const trimmed = value.trim().replace(/\/+$/, "");
    if (!trimmed || trimmed === "*") {
        return "";
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    if (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(trimmed)) {
        return `http://${trimmed}`;
    }

    return `${DEFAULT_PROTOCOL}://${trimmed}`;
};

const getConfiguredFrontendBaseUrl = () => {
    const explicitBaseUrl = [
        process.env.FRONTEND_BASE_URL,
        process.env.FRONTEND_URL,
        process.env.CLIENT_URL,
        process.env.APP_BASE_URL
    ]
        .map(normalizeBaseUrl)
        .find(Boolean);

    if (explicitBaseUrl) {
        return explicitBaseUrl;
    }

    return String(process.env.CORS_ORIGINS || "")
        .split(",")
        .map((value) => normalizeBaseUrl(value))
        .find(Boolean) || "";
};

const getRequestHostBaseUrl = (req) => {
    const forwardedHost = String(req?.headers?.["x-forwarded-host"] || "")
        .split(",")[0]
        .trim();
    const host = forwardedHost || String(req?.headers?.host || "").trim();

    if (!host) {
        return "";
    }

    const forwardedProto = String(req?.headers?.["x-forwarded-proto"] || "")
        .split(",")[0]
        .trim();
    const protocol =
        forwardedProto ||
        (/^(localhost|127\.0\.0\.1)(:\d+)?$/i.test(host) ? "http" : DEFAULT_PROTOCOL);

    return normalizeBaseUrl(`${protocol}://${host}`);
};

export const resolveFrontendBaseUrl = (req) => {
    const requestOrigin = normalizeBaseUrl(
        req?.headers?.origin || req?.headers?.["x-frontend-origin"] || ""
    );

    if (requestOrigin) {
        return requestOrigin;
    }

    const configuredBaseUrl = getConfiguredFrontendBaseUrl();
    if (configuredBaseUrl) {
        return configuredBaseUrl;
    }

    return getRequestHostBaseUrl(req);
};

export const buildFrontendUrl = (req, routePath = "/") => {
    const baseUrl = resolveFrontendBaseUrl(req);
    const normalizedRoutePath = routePath.startsWith("/") ? routePath : `/${routePath}`;

    if (!baseUrl) {
        return normalizedRoutePath;
    }

    return new URL(normalizedRoutePath, `${baseUrl}/`).toString();
};
