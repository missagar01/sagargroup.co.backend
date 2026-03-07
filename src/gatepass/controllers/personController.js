import {
    createPersonService,
    getAllPersonsService,
    updatePersonService,
    deletePersonService
} from "../services/personService.js";

/* CREATE */
export const createPerson = async (req, res, next) => {
    try {
        const { personToMeet, phone } = req.body;

        if (!personToMeet || !phone) {
            return res.status(400).json({
                success: false,
                message: "All fields required"
            });
        }

        const data = await createPersonService(personToMeet, phone);

        res.status(201).json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/* GET ALL */
export const getAllPersons = async (req, res, next) => {
    try {
        const data = await getAllPersonsService();
        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};

/* UPDATE */
export const updatePerson = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { personToMeet, phone } = req.body;

        if (!personToMeet || !phone) {
            return res.status(400).json({
                success: false,
                message: "personToMeet and phone are required"
            });
        }

        await updatePersonService(id, personToMeet, phone);

        res.json({
            success: true,
            message: "Person updated successfully"
        });
    } catch (err) {
        next(err);
    }
};

/* DELETE */
export const deletePerson = async (req, res, next) => {
    try {
        const { id } = req.params;

        await deletePersonService(id);

        res.json({
            success: true,
            message: "Person deleted successfully"
        });
    } catch (err) {
        next(err);
    }
};
