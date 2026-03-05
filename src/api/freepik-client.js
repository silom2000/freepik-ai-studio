const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const EventEmitter = require('events');

class FreepikClient extends EventEmitter {
    constructor(apiKey) {
        super();

        // Support multiple API keys:
        // - array of keys: ['KEY1', 'KEY2']
        // - comma-separated string: 'KEY1,KEY2,KEY3'
        if (Array.isArray(apiKey)) {
            this.apiKeys = apiKey.filter(Boolean).map(k => k.trim());
        } else if (typeof apiKey === 'string') {
            this.apiKeys = apiKey.split(',').map(k => k.trim()).filter(Boolean);
        } else {
            this.apiKeys = [];
        }

        if (!this.apiKeys.length && apiKey) {
            this.apiKeys = [String(apiKey).trim()];
        }

        this.currentKeyIndex = 0;
        this.keyStates = this.apiKeys.map(() => ({ invalid: false, exhausted: false }));

        this.apiKey = this.apiKeys[0] || null;
        this.baseURL = 'https://api.freepik.com/v1';
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: this.apiKey
                ? {
                    'x-freepik-api-key': this.apiKey
                }
                : {}
        });

        // Add request interceptor for logging
        this.client.interceptors.request.use(request => {
            try {
                this.log('request', `${request.method.toUpperCase()} ${request.url}`, {
                    headers: this.sanitizeHeaders(request.headers),
                    // Only log data if it's safe - avoid circular references
                    data: this.sanitizeData(request.data)
                });
            } catch (err) {
                console.error('Error logging request:', err);
            }
            return request;
        });

        // Add response interceptor for logging
        this.client.interceptors.response.use(
            response => {
                try {
                    this.log('response', `${response.status} ${response.config.url}`, {
                        data: this.sanitizeData(response.data)
                    });
                } catch (err) {
                    console.error('Error logging response:', err);
                }
                return response;
            },
            error => {
                try {
                    this.log('error', `API Error: ${error.message}`, {
                        response: this.sanitizeData(error.response?.data),
                        status: error.response?.status
                    });
                } catch (err) {
                    console.error('Error logging error:', err);
                }
                return Promise.reject(error);
            }
        );

        // Free tier limits (requests per day)
        this.freeLimits = {
            'kling-o1-pro': 5,
            'kling-o1-std': 5,
            'kling-v2': 5,
            'kling-v2-1-pro': 11,
            'kling-v2-6-pro': 11,
            'wan-i2v-720p': 20,
            'wan-i2v-1080p': 11,
            'wan-2-5-i2v-720p': 20,
            'wan-t2v-720p': 20,
            'wan-t2v-1080p': 11,
            'minimax-hailuo-2-3-1080p': 11,
            'ltx-video-2-pro': 5,
            'pixverse-v5': 125
        };
    }

    getActiveApiKey() {
        if (!this.apiKeys || !this.apiKeys.length) return null;
        return this.apiKeys[this.currentKeyIndex] || null;
    }

    setActiveApiKeyByIndex(index) {
        if (!this.apiKeys || index < 0 || index >= this.apiKeys.length) {
            return;
        }
        this.currentKeyIndex = index;
        this.apiKey = this.apiKeys[index];

        if (this.apiKey) {
            this.client.defaults.headers['x-freepik-api-key'] = this.apiKey;
        } else if (this.client.defaults.headers && this.client.defaults.headers['x-freepik-api-key']) {
            delete this.client.defaults.headers['x-freepik-api-key'];
        }
    }

    markCurrentKeyStatus(statusCode) {
        if (!this.keyStates || !this.keyStates.length) return;
        const state = this.keyStates[this.currentKeyIndex];
        if (!state) return;

        if (statusCode === 401) {
            state.invalid = true;
        } else if (statusCode === 429) {
            state.exhausted = true;
        }
    }

    switchToNextAvailableKey() {
        if (!this.apiKeys || this.apiKeys.length <= 1) return false;

        const total = this.apiKeys.length;
        for (let offset = 1; offset <= total; offset++) {
            const nextIndex = (this.currentKeyIndex + offset) % total;
            const state = this.keyStates[nextIndex];
            if (!state || state.invalid || state.exhausted) continue;

            this.setActiveApiKeyByIndex(nextIndex);
            this.log('info', 'Switched Freepik API key', {
                activeIndex: nextIndex + 1,
                totalKeys: total
            });
            return true;
        }
        return false;
    }

    async createTaskWithKeyRotation(endpointPath, payload, model, axiosConfig = {}) {
        const maxAttempts = (this.apiKeys && this.apiKeys.length) || 1;
        let lastError;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const activeKey = this.getActiveApiKey();
            if (!activeKey) {
                throw new Error('No Freepik API key configured');
            }

            this.log('info', `Using Freepik API key ${this.currentKeyIndex + 1}/${this.apiKeys.length || 1} for ${model}`, {
                attempt: attempt + 1
            });

            try {
                const response = await this.client.post(endpointPath, payload, axiosConfig);
                return response;
            } catch (error) {
                const status = error.response?.status;
                lastError = error;

                if ((status === 401 || status === 429) && this.apiKeys && this.apiKeys.length > 1) {
                    this.markCurrentKeyStatus(status);
                    const rotated = this.switchToNextAvailableKey();
                    if (rotated) {
                        continue;
                    }
                }

                throw error;
            }
        }

        throw lastError || new Error('Failed to create task with any Freepik API key');
    }

    log(type, message, data = null) {
        this.emit('log', {
            timestamp: new Date().toISOString(),
            type,
            message,
            data
        });
    }

    sanitizeHeaders(headers) {
        if (!headers) return {};
        const sanitized = { ...headers };
        if (sanitized['x-freepik-api-key']) {
            sanitized['x-freepik-api-key'] = '***';
        }
        return sanitized;
    }

    sanitizeData(data) {
        if (!data) return null;
        try {
            // Deep clone and truncate long strings
            const sanitizeValue = (value) => {
                if (typeof value === 'string') {
                    if (value.length > 500) return value.substring(0, 500) + '...[TRUNCATED]';
                    return value;
                }
                if (Array.isArray(value)) {
                    return value.map(sanitizeValue);
                }
                if (typeof value === 'object' && value !== null) {
                    const newObj = {};
                    for (const key in value) {
                        newObj[key] = sanitizeValue(value[key]);
                    }
                    return newObj;
                }
                return value;
            };

            const cleanData = JSON.parse(JSON.stringify(data));
            return sanitizeValue(cleanData);
        } catch (e) {
            return '[Complex/Circular Data]';
        }
    }

    // Get free tier limit for a model
    getFreeLimit(model) {
        return this.freeLimits[model] || 0;
    }

    // Get all models with their limits
    static getModelsInfo() {
        return {
            'kling-o1-pro': {
                name: 'Kling O1 Pro',
                freeLimit: 5,
                description: '5-10s, High Quality',
                type: 'image-to-video'
            },
            'kling-o1-std': {
                name: 'Kling O1 Standard',
                freeLimit: 5,
                description: '5-10s, Standard Quality',
                type: 'image-to-video'
            },
            'kling-v2': {
                name: 'Kling 2.0',
                freeLimit: 5,
                description: 'Image-to-video',
                type: 'image-to-video'
            },
            'kling-v2-1-pro': {
                name: 'Kling 2.1 Pro',
                freeLimit: 11,
                description: 'Text/Image-to-video, 5-10s',
                type: 'both'
            },
            'kling-v2-6-pro': {
                name: 'Kling 2.6 Pro',
                freeLimit: 11,
                description: 'Image-to-video, 5-10s',
                type: 'image-to-video'
            },
            'wan-i2v-720p': {
                name: 'WAN 2.6 i2v 720p',
                freeLimit: 20,
                description: '5-15s, 720p',
                type: 'image-to-video'
            },
            'wan-i2v-1080p': {
                name: 'WAN 2.6 i2v 1080p',
                freeLimit: 11,
                description: '5-15s, 1080p',
                type: 'image-to-video'
            },
            'wan-2-5-i2v-720p': {
                name: 'WAN 2.5 i2v 720p',
                freeLimit: 20,
                description: '5-10s, 720p',
                type: 'image-to-video'
            },
            'wan-t2v-720p': {
                name: 'WAN 2.6 t2v 720p',
                freeLimit: 20,
                description: '5-15s, 720p',
                type: 'text-to-video'
            },
            'wan-t2v-1080p': {
                name: 'WAN 2.6 t2v 1080p',
                freeLimit: 11,
                description: '5-15s, 1080p',
                type: 'text-to-video'
            },
            'minimax-hailuo-2-3-1080p': {
                name: 'MiniMax Hailuo 2.3 1080p',
                freeLimit: 11,
                description: 'Text/Image-to-video, 6s, 1080p',
                type: 'both'
            },
            'ltx-video-2-pro': {
                name: 'LTX Video 2.0 Pro',
                freeLimit: 5,
                description: 'Text/Image-to-Video, 4K/1080p, 6-10s',
                type: 'both'
            },
            'pixverse-v5': {
                name: 'PixVerse V5',
                freeLimit: 5,
                description: 'Image-to-Video, 4K/1080p, 5-8s',
                type: 'image-to-video'
            }
        };
    }

    // Model endpoints mapping
    getModelEndpoint(model) {
        const endpoints = {
            'kling-o1-pro': { create: '/ai/image-to-video/kling-o1-pro', get: '/ai/image-to-video/kling-o1' },
            'kling-o1-std': { create: '/ai/image-to-video/kling-o1-std', get: '/ai/image-to-video/kling-o1' },
            'kling-v2': { create: '/ai/image-to-video/kling-v2', get: '/ai/image-to-video/kling-v2' },
            'kling-v2-1-pro': { create: '/ai/image-to-video/kling-v2-1-pro', get: '/ai/image-to-video/kling-v2-1' },
            'kling-v2-6-pro': { create: '/ai/image-to-video/kling-v2-6-pro', get: '/ai/image-to-video/kling-v2-6-pro' },
            'wan-i2v-720p': { create: '/ai/image-to-video/wan-v2-6-720p', get: '/ai/image-to-video/wan-v2-6-720p' },
            'wan-i2v-1080p': { create: '/ai/image-to-video/wan-v2-6-1080p', get: '/ai/image-to-video/wan-v2-6-1080p' },
            'wan-2-5-i2v-720p': { create: '/ai/image-to-video/wan-2-5-i2v-720p', get: '/ai/image-to-video/wan-2-5-i2v-720p' },
            'wan-t2v-720p': { create: '/ai/text-to-video/wan-v2-6-720p', get: '/ai/text-to-video/wan-v2-6-720p' },
            'wan-t2v-1080p': { create: '/ai/text-to-video/wan-v2-6-1080p', get: '/ai/text-to-video/wan-v2-6-1080p' },
            'minimax-hailuo-2-3-1080p': { create: '/ai/image-to-video/minimax-hailuo-2-3-1080p', get: '/ai/image-to-video/minimax-hailuo-2-3-1080p' },
            'ltx-video-2-pro': { create: '/ai/text-to-video/ltx-2-pro', get: '/ai/text-to-video/ltx-2-pro' },
            'pixverse-v5': { create: '/ai/image-to-video/pixverse-v5', get: '/ai/image-to-video/pixverse-v5' }
        };
        return endpoints[model];
    }

    // Upload image to ImgBB and get URL
    async uploadToImgBB(base64Image) {
        this.log('info', 'Uploading image to ImgBB...');
        try {
            const formData = new FormData();
            formData.append('key', process.env.IMGBB_API_KEY);
            formData.append('image', base64Image);

            const response = await axios.post('https://api.imgbb.com/1/upload', formData, {
                headers: formData.getHeaders()
            });

            if (response.data && response.data.data && response.data.data.url) {
                this.log('success', 'Image uploaded to ImgBB', { url: response.data.data.url });
                return response.data.data.url;
            } else {
                throw new Error('Failed to get image URL from ImgBB');
            }
        } catch (error) {
            this.log('error', 'ImgBB Upload Failed', error.response?.data || error.message);
            console.error('ImgBB Upload Error:', error.response?.data || error.message);
            throw new Error(`ImgBB Upload Failed: ${error.message}`);
        }
    }

    mapAspectRatio(model, ratio) {
        if (!ratio) return null;

        // Kling models (v2, v2.1, o1) use verbose format
        if (model.includes('kling')) {
            const mapping = {
                '16:9': 'widescreen_16_9',
                '9:16': 'social_story_9_16',
                '1:1': 'square_1_1'
            };
            return mapping[ratio] || ratio;
        }

        // WAN and others use standard format
        return ratio;
    }

    snapDuration(model, duration, validValues) {
        if (!duration) return validValues[0];
        const num = parseInt(duration);
        return validValues.reduce((prev, curr) => Math.abs(curr - num) < Math.abs(prev - num) ? curr : prev);
    }

    cancelGeneration() {
        this._aborted = true;
        this.log('warning', 'Generation cancellation requested');
    }

    formatError(error, model) {
        if (error.response?.data?.invalid_params) {
            const details = error.response.data.invalid_params.map(p => `${p.field}: ${p.reason}`).join(', ');
            this.log('error', `${model} Validation Error: ${details}`);
            return new Error(`${model} Validation Error: ${details}`);
        }

        let errorData = '';
        if (error.response?.data) {
            if (typeof error.response.data === 'string' && (error.response.data.trim().startsWith('<') || error.response.data.includes('<!DOCTYPE'))) {
                errorData = '[HTML Error Response]';
            } else {
                errorData = JSON.stringify(error.response.data);
            }
        }

        const statusCode = error.response?.status;
        let message = error.response?.data?.message || error.message;

        if (statusCode === 504) {
            message = 'Gateway Timeout (504) - The model service is taking too long to respond.';
        } else if (statusCode === 502) {
            message = 'Bad Gateway (502) - The model service is temporarily unavailable.';
        } else if (statusCode === 500) {
            message = 'Internal Server Error (500) - The model service encountered an error.';
        } else if (statusCode === 429) {
            message = 'Too Many Requests (429) - Rate limit exceeded. Please try again later.';
        }

        return new Error(`${model}: ${message} ${errorData}`);
    }

    async generateVideoFromImage(model, imageData, parameters = {}) {
        this._aborted = false;
        const startTime = Date.now();
        const endpoint = this.getModelEndpoint(model);

        if (!endpoint) {
            throw new Error(`Unknown model: ${model}`);
        }

        try {
            let createResponse;

            // ALL models now use JSON payload
            const payload = {
                prompt: parameters.prompt || ''
            };

            // 1. Handle LTX (needs public URL)
            if (model === 'ltx-video-2-pro') {
                let imageUrl;
                if (parameters.image_url) {
                    imageUrl = parameters.image_url;
                } else {
                    if (!process.env.IMGBB_API_KEY) {
                        throw new Error('IMGBB_API_KEY is missing in .env file. Required for LTX Video 2.0 Pro.');
                    }
                    imageUrl = await this.uploadToImgBB(imageData);
                }
                payload.image_url = imageUrl;

                // Customizable parameters
                payload.resolution = parameters.resolution || '1080p';
                payload.fps = parameters.fps ? parseInt(parameters.fps) : 25;
                payload.generate_audio = !!parameters.generate_audio;
                if (parameters.seed) payload.seed = parseInt(parameters.seed);

                // Allow prompt override if needed, though usually empty for I2V unless specified
                if (payload.prompt === '') payload.prompt = 'Video from image';

                const validDurations = [6, 8, 10];
                const inputDuration = parseInt(parameters.duration) || 6; // Default to 6 per docs
                payload.duration = validDurations.reduce((prev, curr) => Math.abs(curr - inputDuration) < Math.abs(prev - inputDuration) ? curr : prev);
            }
            // 2. Handle PixVerse V5 (needs public URL)
            else if (model === 'pixverse-v5') {
                let imageUrl;
                if (parameters.image_url) {
                    imageUrl = parameters.image_url;
                } else {
                    if (!process.env.IMGBB_API_KEY) {
                        throw new Error('IMGBB_API_KEY is missing in .env file. Required for PixVerse V5.');
                    }
                    imageUrl = await this.uploadToImgBB(imageData);
                }
                payload.image_url = imageUrl;

                // 1. Aspect Ratio Mapping (Required)
                const ratioMap = {
                    '16:9': 'widescreen_16_9',
                    '9:16': 'social_story_9_16',
                    '1:1': 'square_1_1',
                    '4:3': 'classic_4_3',
                    '3:4': 'traditional_3_4'
                };
                // Default to 16:9 if missing or unknown
                payload.aspect_ratio = ratioMap[parameters.aspect_ratio] || 'widescreen_16_9';

                // 2. Resolution & Duration Constraints
                // PixVerse V5 Constraint: 1080p is only allowed for 5s. 8s requires lower res or specific ratio? 
                // Actually docs say 1080p limited to 5s. 
                // Let's trust the config/docs: 
                // Resolution: 360p, 540p, 720p, 1080p.

                payload.resolution = parameters.resolution || '1080p';

                if (parameters.style) payload.style = parameters.style;
                if (parameters.seed) payload.seed = parseInt(parameters.seed);
                if (parameters.negative_prompt) payload.negative_prompt = parameters.negative_prompt;

                // Duration logic: 5 or 8.
                let targetDuration = parseInt(parameters.duration) || 5;

                // If 1080p, force 5s
                if (payload.resolution === '1080p') {
                    payload.duration = 5;
                } else {
                    payload.duration = this.snapDuration(model, targetDuration, [5, 8]);
                }
            }
            // 3. Handle Base64 models
            else {
                const imageDataUrl = `data:image/jpeg;base64,${imageData}`;

                if (model === 'minimax-hailuo-2-3-1080p') {
                    payload.first_frame_image = imageDataUrl;
                    payload.duration = 6;
                    payload.prompt_optimizer = true;
                    // Ensure prompt is not empty for MiniMax
                    if (!payload.prompt) payload.prompt = 'Video from image';
                } else if (model === 'wan-2-5-i2v-720p') {
                    payload.image = imageDataUrl;
                    // WAN 2.5 720p supports 5 or 10 seconds
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
                } else if (model.startsWith('wan-i2v')) {
                    payload.image = imageDataUrl;
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10, 15]));
                } else if (model === 'kling-v2-1-pro' || model === 'kling-v2-6-pro') {
                    payload.image = imageDataUrl;
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
                    // Ensure prompt is not empty
                    if (!payload.prompt) payload.prompt = 'Video from image';
                } else if (model === 'kling-v2') {
                    // Kling V2 uses 'image'
                    payload.image = imageDataUrl;
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5]));
                    // Ensure prompt is not empty
                    if (!payload.prompt) payload.prompt = 'Video from image';
                } else if (model.startsWith('kling-o1')) {
                    // Kling O1 uses 'first_frame'
                    payload.first_frame = imageDataUrl;
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
                    // Ensure prompt is not empty
                    if (!payload.prompt) payload.prompt = 'Video from image';
                }
            }

            // Common parameters if not already set
            if (parameters.aspect_ratio && !payload.aspect_ratio && !model.startsWith('ltx') && !model.includes('minimax')) {
                payload.aspect_ratio = this.mapAspectRatio(model, parameters.aspect_ratio);
            }



            // Diagnostic: Log payload
            this.log('request', `Creating task for ${model}`, {
                payload: { ...payload, image: payload.image ? 'DATA_URL' : undefined, first_frame: payload.first_frame ? 'DATA_URL' : undefined }
            });

            createResponse = await this.createTaskWithKeyRotation(
                endpoint.create,
                payload,
                model,
                {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                }
            );

            const taskId = createResponse.data.data?.task_id || createResponse.data.data?.id || createResponse.data.id;

            // Poll for completion
            const result = await this.pollTaskStatus(endpoint.get, taskId);

            const endTime = Date.now();
            const generationTime = (endTime - startTime) / 1000;

            return {
                model,
                taskId,
                videoUrl: result.video_url || result.url || (result.generated && result.generated[0]) || result.data?.video_url || result.data?.url || (typeof result === 'string' ? result : null),
                status: result.status,
                parameters: { ...parameters, prompt: parameters.prompt || '' },
                generationTime,
                metadata: result
            };
        } catch (error) {
            throw this.formatError(error, model);
        }
    }

    async generateVideoFromText(model, prompt, parameters = {}) {
        this._aborted = false;
        const startTime = Date.now();
        const endpoint = this.getModelEndpoint(model);

        if (!endpoint) {
            throw new Error(`Unknown model: ${model}`);
        }

        // Check which models support text-to-video
        const textToVideoModels = ['wan-t2v-720p', 'wan-t2v-1080p', 'kling-v2-1-pro', 'minimax-hailuo-2-3-1080p', 'ltx-video-2-pro'];
        if (!textToVideoModels.includes(model)) {
            throw new Error(`Model ${model} does not support text-to-video`);
        }

        try {
            const payload = {
                prompt
            };

            // MiniMax models need duration as number, others as string or default.
            // DO NOT send aspect_ratio to MiniMax.
            if (model === 'minimax-hailuo-2-3-1080p') {
                payload.duration = 6; // Fixed for MiniMax  
                payload.prompt_optimizer = true;
            } else {
                // Add other common parameters for non-MiniMax models
                if (parameters.duration) payload.duration = String(parameters.duration);
                if (parameters.aspect_ratio) payload.aspect_ratio = this.mapAspectRatio(model, parameters.aspect_ratio);

                if (model === 'kling-v2-1-pro') {
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
                } else if (model === 'ltx-video-2-pro') {
                    // LTX specific parameters
                    payload.resolution = '1080p'; // Default to 1080p
                    payload.fps = 25;
                    payload.generate_audio = false;
                    // Ensure duration is one of 6, 8, 10
                    const validDurations = [6, 8, 10];
                    const inputDuration = parseInt(parameters.duration) || 10;
                    // Find closest valid duration
                    payload.duration = validDurations.reduce((prev, curr) =>
                        Math.abs(curr - inputDuration) < Math.abs(prev - inputDuration) ? curr : prev
                    );
                } else if (model.startsWith('wan-t2v')) {
                    payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10, 15]));
                }
            }

            // Diagnostic: Log payload
            this.log('request', `Creating task (text) for ${model}`, { payload });

            const createResponse = await this.createTaskWithKeyRotation(
                endpoint.create,
                payload,
                model
            );
            const taskId = createResponse.data.data?.task_id || createResponse.data.data?.id || createResponse.data.id;

            // Poll for completion
            const result = await this.pollTaskStatus(endpoint.get, taskId);

            const endTime = Date.now();
            const generationTime = (endTime - startTime) / 1000;

            return {
                model,
                taskId,
                videoUrl: result.video_url || result.url || (result.generated && result.generated[0]) || result.data?.video_url || result.data?.url || (typeof result === 'string' ? result : null),
                status: result.status,
                parameters: { ...parameters, prompt },
                generationTime,
                metadata: result
            };
        } catch (error) {
            throw this.formatError(error, model);
        }
    }

    async pollTaskStatus(getEndpoint, taskId, maxAttempts = 300) { // Increased to 300 (25 mins)
        let attempts = 0;
        let lastStatus = null;

        this.log('info', `Starting poll for task ${taskId}`, { maxAttempts });

        while (attempts < maxAttempts) {
            // Check for cancellation
            if (this._aborted) {
                this.log('warning', `Task ${taskId} cancelled by user`);
                throw new Error('Generation cancelled by user');
            }

            try {
                const response = await this.client.get(`${getEndpoint}/${taskId}`);
                const data = response.data.data || response.data;
                const status = data.status;

                // Log status only if it changes
                if (status !== lastStatus) {
                    this.log('info', `Task ${taskId} status: ${status}`, { progress: data.progress });
                    lastStatus = status;
                }

                if (status === 'completed' || status === 'COMPLETED' || status === 'succeeded' || status === 'SUCCEEDED') {
                    this.log('success', `Task ${taskId} completed successfully`);
                    return data;
                } else if (status === 'failed' || status === 'error' || status === 'FAILED') {
                    this.log('error', `Task ${taskId} failed details:`, data);
                    throw new Error(`Task failed: ${data.error || JSON.stringify(data)}`);
                }

                // Wait 5 seconds before next poll
                await new Promise(resolve => setTimeout(resolve, 5000));
                attempts++;
            } catch (error) {
                if (error.response?.status === 404 || error.response?.status >= 500) {
                    const statusType = error.response?.status === 404 ? 'not found (404)' : `server error (${error.response?.status})`;
                    this.log('warning', `Task ${taskId} ${statusType}, retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    attempts++;
                } else {
                    throw error;
                }
            }
        }

        this.log('error', `Timeout waiting for task ${taskId}`);
        throw new Error('Timeout waiting for video generation');
    }

    async downloadVideo(videoUrl, outputPath) {
        const response = await axios.get(videoUrl, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': '*/*',
                'Referer': 'https://api.freepik.com/'
            }
        });

        // Check if we didn't get an HTML error
        const firstBytes = Buffer.from(response.data.slice(0, 10)).toString().toLowerCase();
        if (firstBytes.includes('<html')) {
            throw new Error('CDN returned HTML instead of video data (Access Denied/403)');
        }

        await fs.promises.writeFile(outputPath, response.data);
        return outputPath;
    }
}

module.exports = FreepikClient;
