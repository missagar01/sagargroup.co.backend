/**
 * Test script to verify the enquiry API endpoint
 * Run this with: node backend/test/test-enquiry-api.js
 */

const axios = require('axios');

const API_BASE_URL = 'http://localhost:3004';

async function testEnquiryAPI() {
    console.log('🧪 Testing Enquiry API Endpoint\n');
    console.log('='.repeat(50));

    // Test data
    const enquiryData = {
        item_type: 'round',
        size: '25 OD',
        thickness: '1.2',
        enquiry_date: '2026-01-29',
        customer: 'Test Customer',
        quantity: 100
    };

    try {
        console.log('\n📤 Sending POST request to:', `${API_BASE_URL}/api/o2d/size-master/enquiry`);
        console.log('📦 Request Data:', JSON.stringify(enquiryData, null, 2));

        const response = await axios.post(
            `${API_BASE_URL}/api/o2d/size-master/enquiry`,
            enquiryData,
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('\n✅ SUCCESS!');
        console.log('📥 Response Status:', response.status);
        console.log('📥 Response Data:', JSON.stringify(response.data, null, 2));

    } catch (error) {
        console.log('\n❌ ERROR!');
        if (error.response) {
            console.log('📥 Response Status:', error.response.status);
            console.log('📥 Response Data:', JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.log('📥 No response received from server');
            console.log('Error:', error.message);
        } else {
            console.log('Error:', error.message);
        }
    }

    console.log('\n' + '='.repeat(50));
}

// Run the test
testEnquiryAPI();
