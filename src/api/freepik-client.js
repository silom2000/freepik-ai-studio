const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");
const EventEmitter = require("events");

class FreepikClient extends EventEmitter {
    constructor(apiKey) {
        super();
        if (Array.isArray(apiKey)) {
            this.apiKeys = apiKey.filter(Boolean).map(k => k.trim());
        } else if (typeof apiKey === "string") {
            this.apiKeys = apiKey.split(",").map(k => k.trim()).filter(Boolean);
        } else {
            this.apiKeys = [];
        }

        this.currentKeyIndex = 0;
        this.apiKey = this.apiKeys[0] || null;
        this.baseURL = "https://api.freepik.com/v1";
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: this.apiKey ? { "x-freepik-api-key": this.apiKey } : {}
        });

        this.client.interceptors.request.use(request => {
            this.log("request", `${request.method.toUpperCase()} ${request.url}`);
            return request;
        });

        this.client.interceptors.response.use(
            response => {
                this.log("response", `${response.status} ${response.config.url}`);
                return response;
            },
            error => {
                this.log("error", `API Error: ${error.message}`);
                return Promise.reject(error);
            }
        );
    }

    log(type, message, data = null) {
        this.emit("log", { timestamp: new Date().toISOString(), type, message, data });
    }

    getModelEndpoint(model) {
        const eps = {
            // VIDEO
            "kling-o1-pro":      { create: "/ai/image-to-video/kling-o1-pro", get: "/ai/image-to-video/kling-o1" },
            "kling-o1-std":      { create: "/ai/image-to-video/kling-o1-std", get: "/ai/image-to-video/kling-o1" },
            "kling-v2":          { create: "/ai/image-to-video/kling-v2",     get: "/ai/image-to-video/kling-v2" },
            "kling-v2-1-pro":    { create: "/ai/image-to-video/kling-v2-1-pro", get: "/ai/image-to-video/kling-v2-1" },
            "kling-v2-5-pro":    { create: "/ai/image-to-video/kling-v2-5-pro", get: "/ai/image-to-video/kling-v2-5" },
            "kling-v2-6-pro":    { create: "/ai/image-to-video/kling-v2-6-pro", get: "/ai/image-to-video/kling-v2-6-pro" },
            "wan-v2-6-720p":     { create: "/ai/image-to-video/wan-v2-6-720p", get: "/ai/image-to-video/wan-v2-6-720p" },
            "wan-v2-6-1080p":    { create: "/ai/image-to-video/wan-v2-6-1080p", get: "/ai/image-to-video/wan-v2-6-1080p" },
            "wan-2-5-i2v-720p":  { create: "/ai/image-to-video/wan-2-5-i2v-720p", get: "/ai/image-to-video/wan-2-5-i2v-720p" },
            "minimax-hailuo-02": { create: "/ai/image-to-video/minimax-hailuo-02-1080p", get: "/ai/image-to-video/minimax-hailuo-02-1080p" },
            "minimax-hailuo-2-3": { create: "/ai/image-to-video/minimax-hailuo-2-3-1080p", get: "/ai/image-to-video/minimax-hailuo-2-3-1080p" },
            "runway-gen4-turbo": { create: "/ai/image-to-video/runway-gen4-turbo", get: "/ai/image-to-video/runway-gen4-turbo" },
            "pixverse-v5":       { create: "/ai/image-to-video/pixverse-v5", get: "/ai/image-to-video/pixverse-v5" },
            "seedance-pro":      { create: "/ai/image-to-video/seedance-pro-1080p", get: "/ai/image-to-video/seedance-pro-1080p" },
            
            // IMAGE
            "mystic":            { create: "/ai/mystic", get: "/ai/mystic" },
            "flux-kontext-pro":  { create: "/ai/text-to-image/flux-kontext-pro", get: "/ai/text-to-image/flux-kontext-pro" },
            "flux-2-pro":        { create: "/ai/text-to-image/flux-2-pro", get: "/ai/text-to-image/flux-2-pro" },
            "flux-2-turbo":      { create: "/ai/text-to-image/flux-2-turbo", get: "/ai/text-to-image/flux-2-turbo" },
            "flux-2-klein":      { create: "/ai/text-to-image/flux-2-klein", get: "/ai/text-to-image/flux-2-klein" },
            "seedream-4-5":       { create: "/ai/text-to-image/seedream-4k", get: "/ai/text-to-image/seedream-4k" }
        };
        return eps[model];
    }

    async generateVideoFromImage(model, imageData, parameters = {}) {
        const endpoint = this.getModelEndpoint(model);
        const payload = { ...parameters, image: `data:image/jpeg;base64,${imageData}` };
        if (model.includes("minimax") || model.includes("mystic") || model.includes("flux")) payload.first_frame_image = payload.image;

        const res = await this.client.post(endpoint.create, payload);
        const taskId = res.data.data?.task_id || res.data.data?.id;
        return this.pollTask(endpoint.get, taskId, model, parameters);
    }

    async generateImage(model, prompt, parameters = {}) {
        const endpoint = this.getModelEndpoint(model);
        const res = await this.client.post(endpoint.create, { prompt, ...parameters });
        const taskId = res.data.data?.task_id || res.data.data?.id || res.data.id;
        return this.pollTask(endpoint.get, taskId, model, { prompt, ...parameters }, "image");
    }

    async pollTask(getEp, taskId, model, params, type = "video") {
        let attempts = 0;
        while (attempts < 100) {
            const res = await this.client.get(`${getEp}/${taskId}`);
            const data = res.data.data || res.data;
            if (data.status === "completed" || data.status === "COMPLETED" || data.status === "SUCCEEDED") {
                return {
                    model, taskId, status: "completed", parameters: params, 
                    videoUrl: data.video_url || data.url || (data.generated && data.generated[0]),
                    imageUrl: data.image_url || data.url || (data.generated && data.generated[0])
                };
            }
            if (data.status === "failed" || data.status === "ERROR") throw new Error(`Task failed: ${data.error}`);
            await new Promise(r => setTimeout(r, 5000));
            attempts++;
        }
        throw new Error("Timeout");
    }
}
module.exports = FreepikClient;