const FreepikClient = require('./src/api/freepik-client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new FreepikClient(process.env.FREEPIK_API_KEY);

const logFile = path.join(__dirname, 'test_results.log');
// clear previous log
fs.writeFileSync(logFile, '');

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

// Setup logging to console and file
client.on('log', (logEntry) => {
    if (logEntry.type === 'error' || logEntry.type === 'warning' || logEntry.type === 'success') {
        const msg = `[${logEntry.type.toUpperCase()}] ${logEntry.message}`;
        log(msg);
        if (logEntry.type === 'error' && logEntry.data) {
            log(JSON.stringify(logEntry.data, null, 2));
        }
    }
});

async function runTests() {
    // Corrected path to image based on find_by_name result (d:\Python\freepik\IMG_20191015_154349.jpg)
    const imagePath = path.join(__dirname, 'IMG_20191015_154349.jpg');
    let imageBase64;

    if (fs.existsSync(imagePath)) {
        console.log('Read image from:', imagePath);
        const imageBuffer = fs.readFileSync(imagePath);
        imageBase64 = imageBuffer.toString('base64');
    } else {
        console.warn('Test image not found, using fallback 1x1 pixel PNG.');
        // 1x1 white pixel PNG
        imageBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKwjwAAAAABJRU5ErkJggg==";
    }

    // Updated test cases with confirmed endpoints and payload requirements
    const tests = [
        { model: 'kling-o1-std', type: 'image', name: 'Kling O1 Standard' },
        { model: 'kling-v2', type: 'image', name: 'Kling 2.0' },
        { model: 'kling-v2-1-pro', type: 'image', name: 'Kling 2.1 Pro' },

        { model: 'wan-2-5-i2v-720p', type: 'image', name: 'WAN 2.5 i2v 720p' },
        { model: 'wan-i2v-720p', type: 'image', name: 'WAN 2.6 i2v 720p' },

        { model: 'minimax-hailuo-2-3-1080p', type: 'image', name: 'MiniMax Hailuo 2.3' },
        { model: 'ltx-video-2-pro', type: 'image', name: 'LTX Video 2.0 Pro' },
        {
            model: 'pixverse-v5',
            type: 'image',
            name: 'PixVerse V5',
            params: {
                prompt: 'A cinematic shot of a cyberpunk city street, neon lights, rain',
                duration: 5,
                resolution: '1080p'
            }
        },

        { model: 'wan-t2v-720p', type: 'text', name: 'WAN 2.6 t2v 720p' },
    ];

    log(`\n=== Starting Comprehensive Test (${tests.length} scenarios) ===\n`);

    const results = [];

    for (const test of tests) {
        log(`\n----------------------------------------`);
        log(`Testing: ${test.name} (${test.model})`);
        log(`----------------------------------------`);

        try {
            let result;
            if (test.type === 'image') {
                result = await client.generateVideoFromImage(test.model, imageBase64, test.params || {
                    prompt: "A cinematic shot of a cyberpunk city street, neon lights, rain",
                    duration: 5 // Default
                });
            } else {
                result = await client.generateVideoFromText(test.model, "A cute robot gardening in a futuristic greenhouse, 4k, high detail", {
                    duration: 5
                });
            }

            log(`✅ SUCCESS: ${test.model}`);
            if (result.videoUrl) log(`   Video URL: ${result.videoUrl}`);
            results.push({ ...test, outcome: 'SUCCESS', url: result.videoUrl });

        } catch (error) {
            log(`❌ FAILED: ${test.model}`);
            log(`   Error: ${error.message}`);
            results.push({ ...test, outcome: 'FAILED', error: error.message });
        }

        // Small delay between tests to be polite to API
        await new Promise(r => setTimeout(r, 2000));
    }

    log(`\n\n=== Test Results Summary ===`);
    // Format summary manually for log file
    log('Model | Outcome | Details');
    log('--- | --- | ---');
    results.forEach(r => {
        log(`${r.model} | ${r.outcome} | ${r.outcome === 'SUCCESS' ? 'Video Generated' : r.error}`);
    });
}

runTests();
