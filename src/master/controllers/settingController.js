// controllers/settingController.js
import settingsService from "../services/settingsService.js";

export const getUsers = async (req, res, next) => {
    try {
        const users = await settingsService.getAllUsers();
        res.json(users);
    } catch (error) {
        next(error);
    }
};

export const getUserById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const authUser = req.user;

        // Ownership Check: Admin or Self
        const isAdmin = authUser.role === "admin" || authUser.user_name === "admin";
        if (!isAdmin && String(authUser.id) !== String(id)) {
            const error = new Error("Not authorized to access this user's data");
            error.statusCode = 403;
            return next(error);
        }

        const user = await settingsService.getUserById(id);

        if (!user) {
            const error = new Error("User not found");
            error.statusCode = 404;
            return next(error);
        }

        res.json(user);
    } catch (error) {
        next(error);
    }
};

export const patchSystemAccess = async (req, res, next) => {
    try {
        const { id } = req.params;
        const authUser = req.user;

        // Ownership Check: Admin or Self (though usually only admin should edit this, user request implies protecting the route)
        const isAdmin = authUser.role === "admin" || authUser.user_name === "admin";
        if (!isAdmin && String(authUser.id) !== String(id)) {
            const error = new Error("Not authorized to modify this user's data");
            error.statusCode = 403;
            return next(error);
        }

        let { system_access } = req.body;

        if (!system_access) {
            const error = new Error("system_access is required");
            error.statusCode = 400;
            return next(error);
        }

        system_access = system_access.trim().toUpperCase();

        const existing = await settingsService.getSystemAccess(id);

        if (!existing) {
            const error = new Error("User not found");
            error.statusCode = 404;
            return next(error);
        }

        let current = [];

        if (existing.system_access) {
            current = existing.system_access
                .split(",")
                .map(v => v.trim().toUpperCase());
        }

        if (current.includes(system_access)) {
            current = current.filter(v => v !== system_access);
        } else {
            current.push(system_access);
        }

        const updatedUser = await settingsService.updateSystemAccess(id, current.join(","));

        res.json(updatedUser);

    } catch (error) {
        next(error);
    }
};



