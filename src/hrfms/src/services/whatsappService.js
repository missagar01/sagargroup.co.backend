const axios = require('axios');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class WhatsAppService {
    constructor() {
        this.productId = process.env.MAYTAPI_PRODUCT_ID;
        this.token = process.env.MAYTAPI_TOKEN;
        this.phoneId = process.env.MAYTAPI_PHONE_ID;
        // Using the URL structure from your working Google Apps Script
        this.baseUrl = `https://api.maytapi.com/api/${this.productId}/${this.phoneId}`;
    }

    async sendLeaveRequestMessage(to, data, isUrgent = false) {
        if (!this.productId || !this.token || !this.phoneId) {
            console.warn('WhatsApp service credentials missing. Skipping message.');
            return;
        }

        if (!to) {
            console.warn('No mobile number provided for WhatsApp message.');
            return;
        }

        // 1. Anti-Blocking Delay (Randomized)
        // For individual requests, we use a 3-7 second delay to mimic human behavior
        const delay = Math.floor(Math.random() * 4000) + 3000;
        console.log(`Waiting ${delay}ms before sending to ${to} to avoid spam blocking...`);
        await sleep(delay);

        // Ensure number is in correct format (adding 91 for India if 10 digits)
        let formattedNumber = to.toString().replace(/\D/g, '');
        if (formattedNumber.length === 10) {
            formattedNumber = '91' + formattedNumber;
        }

        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
            } catch (e) {
                return dateStr;
            }
        };

        // 2. Message Variation (Adding timestamp to make each message unique)
        const timestamp = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

        const message = `${isUrgent ? '*URGENT: Leave Notification*' : '*Leave Request Submitted*'}
      
*Employee:* ${data.employee_name}
*From:* ${formatDate(data.from_date)}
*To:* ${formatDate(data.to_date)}
*Reason:* ${data.reason}
*Status:* Pending

Your leave request has been submitted successfully.
_Ref: ${timestamp}_`;

        try {
            console.log(`Sending WhatsApp to ${formattedNumber} via ${this.baseUrl}/sendMessage`);
            const response = await axios.post(
                `${this.baseUrl}/sendMessage`,
                {
                    to_number: formattedNumber,
                    type: 'text',
                    message: message
                },
                {
                    headers: {
                        'x-maytapi-key': this.token,
                        'Content-Type': 'application/json'
                    }
                }
            );

            console.log('WhatsApp message sent successfully:', response.data);
            return response.data;
        } catch (error) {
            console.error('Error sending WhatsApp message:', error.response?.data || error.message);
            // We don't want to throw error here as it shouldn't break the main leave request creation
        }
    }

    async sendLeaveStatusUpdate(to, data) {
        if (!this.productId || !this.token || !this.phoneId || !to) return;

        const delay = Math.floor(Math.random() * 4000) + 3000;
        await sleep(delay);

        let formattedNumber = to.toString().replace(/\D/g, '');
        if (formattedNumber.length === 10) formattedNumber = '91' + formattedNumber;

        const formatDate = (dateStr) => {
            if (!dateStr) return 'N/A';
            try {
                const date = new Date(dateStr);
                return date.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
            } catch (e) {
                return dateStr;
            }
        };

        const timestamp = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
        const status = data.approved_by_status || 'Updated';
        const emoji = status.toLowerCase() === 'approved' ? '✅' : status.toLowerCase() === 'rejected' ? '❌' : 'ℹ️';

        const message = `*Leave Request ${status}* ${emoji}
      
*Employee:* ${data.employee_name}
*From:* ${formatDate(data.from_date)}
*To:* ${formatDate(data.to_date)}
*Status:* ${status}
*Updated By:* ${data.approved_by || 'Manager'}

Your leave request has been processed.
_Ref: ${timestamp}_`;

        try {
            await axios.post(`${this.baseUrl}/sendMessage`, {
                to_number: formattedNumber,
                type: 'text',
                message: message
            }, {
                headers: { 'x-maytapi-key': this.token, 'Content-Type': 'application/json' }
            });
            console.log(`Status update sent to ${formattedNumber}: ${status}`);
        } catch (error) {
            console.error('Error sending status update:', error.response?.data || error.message);
        }
    }
}

module.exports = new WhatsAppService();
