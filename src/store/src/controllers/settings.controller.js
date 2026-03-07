import {
    getUsersService,
    patchStoreAccessService
} from "../services/settings.services.js";

export const getUsers = async (req, res) => {
    try {
        const users = await getUsersService();
        res.json({
            success: true,
            data: users,
        });
    } catch (error) {
        console.error("Error fetching users:", error);
        res.status(500).json({
            success: false,
            message: "Database error",
        });
    }
};


export const patchStoreAccess = async (req, res) => {
    try {
        const { id } = req.params;
        let { store_access } = req.body;

        const updatedUser = await patchStoreAccessService(id, store_access);

        res.json({
            success: true,
            data: updatedUser,
        });
    } catch (error) {
        console.error("Error patching store_access:", error);
        res.status(500).json({
            success: false,
            message: "Database error",
        });
    }
};

