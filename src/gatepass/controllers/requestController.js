import {
    createVisitRequestService,
    sendVisitRequestWhatsapp,
    getAllVisitsForAdminService,
    getVisitorByMobileService,
    sendVisitRequestWhatsappToGroup
} from "../services/requestService.js";
import { uploadToS3 } from "../middleware/s3Upload.js";

export const createVisitRequest = async (req, res, next) => {
    try {
        const {
            visitorName,
            mobileNumber,
            visitorAddress,
            purposeOfVisit,
            personToMeet,
            dateOfVisit,
            timeOfEntry
        } = req.body;

        const visitorPhoto = req.file
            ? await uploadToS3(req.file)
            : null;

        if (
            !visitorName ||
            !mobileNumber ||
            !personToMeet ||
            !dateOfVisit ||
            !timeOfEntry
        ) {
            return res.status(400).json({
                success: false,
                message: "Missing required fields"
            });
        }

        const { visitorId, person } =
            await createVisitRequestService(
                req.body,
                visitorPhoto
            );

        await sendVisitRequestWhatsapp(person, {
            visitorName,
            mobileNumber,
            visitorAddress,
            purposeOfVisit,
            dateOfVisit,
            timeOfEntry
        });

        await sendVisitRequestWhatsappToGroup(person, {
            visitorName,
            mobileNumber,
            visitorAddress,
            purposeOfVisit,
            dateOfVisit,
            timeOfEntry
        });

        res.status(201).json({
            success: true,
            visitorId,
            message: "Visit request created successfully"
        });
    } catch (err) {
        next(err);
    }
};

export const getAllVisitsForAdmin = async (req, res, next) => {
    try {
        const data = await getAllVisitsForAdminService();

        res.status(200).json({
            success: true,
            data
        });
    } catch (err) {
        next(err);
    }
};

export const getVisitorByMobile = async (req, res, next) => {
    try {
        const { mobile } = req.params;

        if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({
                success: false,
                message: "Invalid mobile number"
            });
        }

        const visitor = await getVisitorByMobileService(mobile);

        if (!visitor) {
            return res.status(404).json({
                success: false,
                found: false
            });
        }

        res.status(200).json({
            success: true,
            found: true,
            data: visitor
        });
    } catch (err) {
        next(err);
    }
};

