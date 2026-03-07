require('dotenv').config();
const leaveRequestService = require('./src/services/leaveRequestService');

async function test() {
    try {
        console.log('Fetching leave requests...');
        const data = await leaveRequestService.getAllLeaveRequests();
        console.log('Success!', data.length, 'records found.');
        process.exit(0);
    } catch (err) {
        console.error('FAILED:', err.message);
        process.exit(1);
    }
}

test();
