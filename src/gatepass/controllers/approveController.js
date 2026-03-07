import {
    fetchVisitsForApprovalService,
    updateVisitApprovalService,
    sendApprovalWhatsappMessage
} from "../services/approveService.js";

export const getVisitsForApproval = async (req, res, next) => {
    try {
        const { personToMeet } = req.query;

        if (!personToMeet) {
            return res.status(400).json({
                success: false,
                message: "personToMeet required"
            });
        }

        const visits = await fetchVisitsForApprovalService(personToMeet);

        res.json({ success: true, visits });
    } catch (err) {
        next(err);
    }
};

export const updateVisitApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status, approvedBy } = req.body;

        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid status"
            });
        }

        const visit = await updateVisitApprovalService(
            id,
            status,
            approvedBy
        );

        const message = `
📢 *Gate Pass:* ${status.toUpperCase()}
👤 *Visitor Name:* ${visit.visitor_name}
👥 *Person To Meet:* ${visit.person_to_meet}
✅ *Status:* ${status.toUpperCase()}
👮 *Approved By:* ${approvedBy}
Click for Close Pass:
🔗 https://gate-pass-srmpl.vercel.app/dashboard/delegation
        `;

        await sendApprovalWhatsappMessage(message);

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};
