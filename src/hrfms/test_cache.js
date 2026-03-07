require('dotenv').config();
const { getOrSetCache } = require('./src/utils/cache');

async function test() {
    try {
        console.log('Testing cache...');
        const result = await Promise.race([
            getOrSetCache('test_key', 10, async () => {
                console.log('Fetch function called');
                return 'test_data';
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Cache timeout')), 5000))
        ]);
        console.log('Result:', result);
        process.exit(0);
    } catch (err) {
        console.error('Error:', err.message);
        process.exit(1);
    }
}

test();
