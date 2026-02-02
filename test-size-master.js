/**
 * Test script for Size Master API
 * Run this file with: node test-size-master.js
 */

const http = require('http');

const BASE_URL = 'http://localhost:3004';

function makeRequest(path) {
    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}${path}`;
        console.log(`\n📡 Testing: ${url}`);

        http.get(url, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    console.log(`✅ Status: ${res.statusCode}`);
                    console.log(`📦 Response:`, JSON.stringify(jsonData, null, 2));
                    resolve(jsonData);
                } catch (e) {
                    console.log(`❌ Failed to parse JSON:`, data);
                    reject(e);
                }
            });
        }).on('error', (err) => {
            console.log(`❌ Request failed:`, err.message);
            reject(err);
        });
    });
}

async function testSizeMasterAPI() {
    console.log('🧪 Starting Size Master API Tests...\n');
    console.log('='.repeat(60));

    try {
        // Test 1: Get all size master data
        console.log('\n📋 Test 1: Get All Size Master Data');
        console.log('-'.repeat(60));
        const allData = await makeRequest('/api/o2d/size-master');

        if (allData.success && allData.data) {
            console.log(`✅ Found ${allData.count} records`);
            if (allData.data.length > 0) {
                console.log(`📝 First record:`, allData.data[0]);
            }
        }

        // Test 2: Get size master by ID (if data exists)
        if (allData.data && allData.data.length > 0) {
            const firstId = allData.data[0].id;
            console.log('\n📋 Test 2: Get Size Master by ID');
            console.log('-'.repeat(60));
            await makeRequest(`/api/o2d/size-master/${firstId}`);
        }

        // Test 3: Test invalid ID
        console.log('\n📋 Test 3: Get Size Master with Invalid ID');
        console.log('-'.repeat(60));
        await makeRequest('/api/o2d/size-master/99999');

        console.log('\n' + '='.repeat(60));
        console.log('✅ All tests completed!');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.log('\n💡 Make sure:');
        console.log('   1. The server is running on port 3004');
        console.log('   2. The database connection is configured correctly');
        console.log('   3. The size_master table exists in the database');
    }
}

// Run tests
testSizeMasterAPI();
