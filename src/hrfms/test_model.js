require('dotenv').config();
const leaveRequestModel = require('./src/models/leaveRequestModel');

async function test() {
    try {
        console.log('Fetching leave requests from model directly...');
        const data = await leaveRequestModel.findAll();
        console.log('Success!', data.length, 'records found.');
        process.exit(0);
    } catch (err) {
        console.error('FAILED:', err.message);
        process.exit(1);
    }
}

test();
