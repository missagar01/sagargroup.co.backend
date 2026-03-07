import {
    fetchAllUserScoresService,
    fetchUserScoreByIdService
} from "../services/userScoreService.js";

/* -------------------- DATE RESOLVER -------------------- */
const resolveDateRange = (startDate, endDate) => {
    if (startDate && endDate) {
        return { startDate, endDate };
    }

    const now = new Date();

    const firstDayOfMonth = new Date(
        now.getFullYear(),
        now.getMonth(),
        1
    );

    const firstDayOfNextMonth = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        1
    );

    return {
        startDate: firstDayOfMonth.toISOString().split("T")[0],
        endDate: firstDayOfNextMonth.toISOString().split("T")[0],
    };
};

/**
 * GET ALL USERS SCORES
 */
export const getAllUserScores = async (req, res, next) => {
    try {
        const { startDate, endDate } = resolveDateRange(
            req.query.startDate,
            req.query.endDate
        );

        const data = await fetchAllUserScoresService(startDate, endDate);

        res.status(200).json({
            success: true,
            startDate,
            endDate,
            count: data.length,
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET SINGLE USER SCORE (by NAME)
 * Route param is still :id (DO NOT CHANGE ROUTE)
 */
export const getUserScoreById = async (req, res, next) => {
    try {
        const userNameParam = decodeURIComponent(req.params.id);
        const authenticatedUser = req.user;

        // AUTH CHECK: User can only see their own score, unless they are admin
        const isAdmin = authenticatedUser.role === "admin" || authenticatedUser.user_name === "admin";
        if (!isAdmin && authenticatedUser.user_name !== userNameParam) {
            const error = new Error("Forbidden: You can only access your own score");
            error.statusCode = 403;
            return next(error);
        }

        console.log("DEBUG: getUserScoreById for userName:", userNameParam, "Original param:", req.params.id);

        const { startDate, endDate } = resolveDateRange(
            req.query.startDate,
            req.query.endDate
        );

        const data = await fetchUserScoreByIdService(
            userNameParam,
            startDate,
            endDate
        );

        res.status(200).json({
            success: true,
            userName: userNameParam,
            startDate,
            endDate,
            count: data.length,
            data
        });
    } catch (error) {
        next(error);
    }
};
