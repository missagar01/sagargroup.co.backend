export const errorHandler = (err, req, res, next) => {
    console.error("GLOBAL ERROR:", err);

    res.status(err.statusCode || 500).json({
        success: false,
        message: err.message || "Server error",
    });
};
