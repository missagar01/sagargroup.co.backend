import jwt from "jsonwebtoken";

function getJwtSecret() {
    return (
        process.env.JWT_SECRET ||
        process.env.JWT_SCREAT ||
        process.env.JWT_SECREAT ||
        process.env.jwt_secret ||
        process.env.jwt_screat ||
        process.env.jwt_secreat ||
        null
    );
}

function extractToken(req) {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || typeof authHeader !== "string") {
        return null;
    }

    if (authHeader.toLowerCase().startsWith("bearer ")) {
        return authHeader.split(" ")[1] || null;
    }

    return authHeader;
}

export const protect = (req, res, next) => {
    const token = extractToken(req);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: "Authorization token missing"
        });
    }

    try {
        const jwtSecret = getJwtSecret();
        if (!jwtSecret) {
            return res.status(500).json({
                success: false,
                message: "JWT secret not configured"
            });
        }

        const decoded = jwt.verify(token, jwtSecret);
        req.user = decoded;
        return next();
    } catch (_err) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token"
        });
    }
};
