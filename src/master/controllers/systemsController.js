import {
    createSystemService,
    getSystemsService,
    getSystemByIdService,
    updateSystemService,
    deleteSystemService,
} from "../services/systemsService.js";

export const createSystem = async (req, res, next) => {
    try {
        const system = await createSystemService(req.body);

        res.status(201).json({
            message: "System created successfully",
            system,
        });
    } catch (err) {
        console.error("Create System Error:", err.message);
        next(err);
    }
};

export const getSystems = async (req, res, next) => {
    try {
        const systems = await getSystemsService();
        res.json(systems);
    } catch (err) {
        console.error("Get Systems Error:", err.message);
        next(err);
    }
};

export const getSystemById = async (req, res, next) => {
    try {
        const system = await getSystemByIdService(req.params.id);
        res.json(system);
    } catch (err) {
        console.error("Get System Error:", err.message);
        next(err);
    }
};

export const updateSystem = async (req, res, next) => {
    try {
        const system = await updateSystemService(req.params.id, req.body);

        res.json({
            message: "System updated successfully",
            system,
        });
    } catch (err) {
        console.error("Update System Error:", err.message);
        next(err);
    }
};

export const deleteSystem = async (req, res, next) => {
    try {
        await deleteSystemService(req.params.id);
        res.json({ message: "System deleted successfully" });
    } catch (err) {
        console.error("Delete System Error:", err.message);
        next(err);
    }
};
