const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

function maskKey(key) {
    if (!key) return '';
    const trimmed = key.trim();
    if (trimmed.length <= 8) return '********';
    return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

async function checkKey(key) {
    const client = axios.create({
        baseURL: 'https://api.freepik.com/v1',
        headers: {
            'x-freepik-api-key': key
        }
    });

    try {
        const response = await client.get('/resources', {
            params: { limit: 1 }
        });

        console.log(`Key ${maskKey(key)}: VALID (status ${response.status})`);
        return { key, status: 'valid', httpStatus: response.status };
    } catch (error) {
        const status = error.response?.status;

        if (status === 401) {
            console.log(`Key ${maskKey(key)}: INVALID (401 Unauthorized)`);
            return { key, status: 'invalid', httpStatus: status };
        }

        if (status === 429) {
            console.log(`Key ${maskKey(key)}: VALID but RATE LIMITED (429 Too Many Requests)`);
            return { key, status: 'rate_limited', httpStatus: status };
        }

        console.log(
            `Key ${maskKey(key)}: ERROR (${status || 'no status'}) - ${error.message}`
        );
        return {
            key,
            status: 'error',
            httpStatus: status,
            message: error.message
        };
    }
}

async function main() {
    const rawKeys = process.env.FREEPIK_API_KEY || '';
    const keys = rawKeys
        .split(',')
        .map(k => k.trim())
        .filter(Boolean);

    if (!keys.length) {
        console.error('FREEPIK_API_KEY is not set or contains no keys.');
        process.exit(1);
    }

    console.log(`Checking ${keys.length} Freepik API key(s)...\n`);

    const results = [];
    for (const key of keys) {
        // eslint-disable-next-line no-await-in-loop
        const result = await checkKey(key);
        results.push(result);
    }

    const summary = results.reduce(
        (acc, r) => {
            acc[r.status] = (acc[r.status] || 0) + 1;
            return acc;
        },
        {}
    );

    console.log('\nSummary:');
    Object.entries(summary).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
    });
}

main().catch(err => {
    console.error('Unexpected error while checking Freepik keys:', err);
    process.exit(1);
});

