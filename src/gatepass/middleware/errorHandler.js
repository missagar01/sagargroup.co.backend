export const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    // Log full error only on server
    console.error("Error:", {
        message: err.message,
        stack: process.env.NODE_ENV ? err.stack : undefined
    });

    res.status(statusCode).json({
        success: false,
        message:
            process.env.NODE_ENV
                ? err.message
                : "Internal server error"
    });
};
