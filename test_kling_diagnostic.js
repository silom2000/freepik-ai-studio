const axios = require('axios');
require('dotenv').config();

async function testKling() {
    const apiKey = process.env.FREEPIK_API_KEY;
    if (!apiKey) {
        console.error('FREEPIK_API_KEY missing');
        return;
    }

    const url = 'https://api.freepik.com/v1/ai/image-to-video/kling-v2-1-pro';

    // Sample small image (1x1 black pixel)
    const base64Image = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAFA3PEY8ED5GWEZGPDpCWH5ishwpWJCqmo9z4JCl8yCQjuGr6WCpk7L7juGyf4iR5/a_fXjfsP8W1v_XjfsP8W1ba298eX-8-fXjfsP8W1f_2QA';

    const payloads = [
        {
            name: 'Exact payload from user logs (empty prompt + mapped aspect ratio)',
            data: {
                prompt: '',
                image: base64Image,
                duration: '5',
                aspect_ratio: 'social_story_9_16'
            }
        },
        {
            name: 'Payload with minimal text prompt',
            data: {
                prompt: 'Gentle motion',
                image: base64Image,
                duration: '5',
                aspect_ratio: 'social_story_9_16'
            }
        }
    ];

    for (const payload of payloads) {
        console.log(`\n--- Testing: ${payload.name} ---`);
        try {
            const response = await axios.post(url, payload.data, {
                headers: {
                    'x-freepik-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            console.log('Task Created!', response.data);

            const taskId = response.data.data?.id || response.data.id;
            console.log('Task ID:', taskId);
        } catch (error) {
            console.log('Failed!');
            console.log('Status:', error.response?.status);
            console.log('Error Data:', JSON.stringify(error.response?.data, null, 2));
        }
    }
}

testKling();
