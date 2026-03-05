const axios = require("axios");
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
        if (!this.apiKeys.length && apiKey) this.apiKeys = [String(apiKey).trim()];

        this.currentKeyIndex = 0;
        this.apiKey = this.apiKeys[0] || null;
        this._aborted = false;

        this.baseURL = "https://api.freepik.com/v1";
        this.client = axios.create({
            baseURL: this.baseURL,
            headers: this.apiKey ? { "x-freepik-api-key": this.apiKey } : {}
        });

        this.client.interceptors.request.use(req => {
            this.log("request", `${req.method.toUpperCase()} ${req.url}`, { data: this.sanitize(req.data) });
            return req;
        });
        this.client.interceptors.response.use(
            res => { this.log("response", `${res.status} ${res.config.url}`, { data: this.sanitize(res.data) }); return res; },
            err => { this.log("error", `API Error ${err.response?.status || ""}: ${err.message}`, { data: err.response?.data }); return Promise.reject(err); }
        );
    }

    log(type, message, data = null) {
        this.emit("log", { timestamp: new Date().toISOString(), type, message, data });
    }

    sanitize(val) {
        if (!val) return null;
        try {
            const clean = v => {
                if (typeof v === "string") return v.length > 300 ? v.slice(0, 300) + "...[TRUNCATED]" : v;
                if (Array.isArray(v)) return v.map(clean);
                if (v && typeof v === "object") { const o = {}; for (const k in v) o[k] = clean(v[k]); return o; }
                return v;
            };
            return clean(JSON.parse(JSON.stringify(val)));
        } catch { return "[Complex Data]"; }
    }

    cancelGeneration() {
        this._aborted = true;
        this.log("warning", "Generation cancellation requested");
    }

    // ---------- ENDPOINTS MAP ----------
    getEndpoint(model) {
        const map = {
            // IMAGE TO VIDEO
            "kling-o1-pro":       { create: "/ai/image-to-video/kling-o1-pro",           poll: "/ai/image-to-video/kling-o1" },
            "kling-o1-std":       { create: "/ai/image-to-video/kling-o1-std",           poll: "/ai/image-to-video/kling-o1" },
            "kling-v2":           { create: "/ai/image-to-video/kling-v2",               poll: "/ai/image-to-video/kling-v2" },
            "kling-v2-1-pro":     { create: "/ai/image-to-video/kling-v2-1-pro",         poll: "/ai/image-to-video/kling-v2-1" },
            "kling-v2-5-pro":     { create: "/ai/image-to-video/kling-v2-5-pro",         poll: "/ai/image-to-video/kling-v2-5" },
            "kling-v2-6-pro":     { create: "/ai/image-to-video/kling-v2-6-pro",         poll: "/ai/image-to-video/kling-v2-6-pro" },
            "wan-i2v-720p":       { create: "/ai/image-to-video/wan-v2-6-720p",          poll: "/ai/image-to-video/wan-v2-6-720p" },
            "wan-i2v-1080p":      { create: "/ai/image-to-video/wan-v2-6-1080p",         poll: "/ai/image-to-video/wan-v2-6-1080p" },
            "wan-2-5-i2v-720p":   { create: "/ai/image-to-video/wan-2-5-i2v-720p",       poll: "/ai/image-to-video/wan-2-5-i2v-720p" },
            "minimax-hailuo-02":  { create: "/ai/image-to-video/minimax-hailuo-02-1080p", poll: "/ai/image-to-video/minimax-hailuo-02-1080p" },
            "minimax-hailuo-2-3": { create: "/ai/image-to-video/minimax-hailuo-2-3-1080p",poll: "/ai/image-to-video/minimax-hailuo-2-3-1080p" },
            "runway-gen4-turbo":  { create: "/ai/image-to-video/runway-gen4-turbo",      poll: "/ai/image-to-video/runway-gen4-turbo" },
            "pixverse-v5":        { create: "/ai/image-to-video/pixverse-v5",            poll: "/ai/image-to-video/pixverse-v5" },
            "seedance-pro":       { create: "/ai/image-to-video/seedance-pro-1080p",     poll: "/ai/image-to-video/seedance-pro-1080p" },
            "ltx-video-2-pro":    { create: "/ai/text-to-video/ltx-2-pro",               poll: "/ai/text-to-video/ltx-2-pro" },
            // TEXT TO VIDEO
            "wan-t2v-720p":       { create: "/ai/text-to-video/wan-v2-6-720p",           poll: "/ai/text-to-video/wan-v2-6-720p" },
            "wan-t2v-1080p":      { create: "/ai/text-to-video/wan-v2-6-1080p",          poll: "/ai/text-to-video/wan-v2-6-1080p" },
            // IMAGE GENERATION
            "mystic":             { create: "/ai/mystic",                                 poll: "/ai/mystic" },
            "flux-kontext-pro":   { create: "/ai/text-to-image/flux-kontext-pro",         poll: "/ai/text-to-image/flux-kontext-pro" },
            "flux-2-pro":         { create: "/ai/text-to-image/flux-2-pro",               poll: "/ai/text-to-image/flux-2-pro" },
            "flux-2-turbo":       { create: "/ai/text-to-image/flux-2-turbo",             poll: "/ai/text-to-image/flux-2-turbo" },
            "flux-2-klein":       { create: "/ai/text-to-image/flux-2-klein",             poll: "/ai/text-to-image/flux-2-klein" },
            "seedream-4-5":       { create: "/ai/text-to-image/seedream-v4-5",            poll: "/ai/text-to-image/seedream-v4-5" }
        };
        return map[model] || null;
    }

    // ---------- ASPECT RATIO MAPPING ----------
    mapAspectRatio(model, ratio, context = "video") {
        if (!ratio) return null;

        // Image generation models need verbose naming
        if (context === "image") {
            const imgMap = {
                "16:9": "widescreen_16_9",
                "9:16": "social_story_9_16",
                "1:1":  "square_1_1",
                "4:3":  "classic_4_3",
                "3:4":  "traditional_3_4",
                "3:2":  "standard_3_2",
                "2:3":  "portrait_2_3"
            };
            return imgMap[ratio] || ratio;
        }

        // Video models — Kling, Seedance, PixVerse use verbose format
        if (model.includes("kling") || model.includes("seedance") || model.includes("pixverse")) {
            const m = { "16:9": "widescreen_16_9", "9:16": "social_story_9_16", "1:1": "square_1_1" };
            return m[ratio] || ratio;
        }

        // WAN, MiniMax, Runway, LTX — use plain ratio string
        return ratio;
    }

    snapDuration(model, duration, valid) {
        const n = parseInt(duration) || valid[0];
        return valid.reduce((p, c) => Math.abs(c - n) < Math.abs(p - n) ? c : p);
    }

    // ---------- IMAGE TO VIDEO ----------
    async generateVideoFromImage(model, imageData, parameters = {}) {
        this._aborted = false;
        const startTime = Date.now();
        const ep = this.getEndpoint(model);
        if (!ep) throw new Error(`Unknown model: ${model}`);

        const imgDataUrl = `data:image/jpeg;base64,${imageData}`;
        const payload = { prompt: parameters.prompt || "Video from image" };

        if (parameters.aspect_ratio) {
            payload.aspect_ratio = this.mapAspectRatio(model, parameters.aspect_ratio);
        }

        // Per-model payload
        if (model === "minimax-hailuo-02" || model === "minimax-hailuo-2-3") {
            payload.first_frame_image = imgDataUrl;
            payload.duration = 6;
            payload.prompt_optimizer = true;
        } else if (model.startsWith("kling-o1")) {
            payload.first_frame = imgDataUrl;
            payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
        } else if (model === "kling-v2") {
            payload.image = imgDataUrl;
            payload.duration = String(this.snapDuration(model, parameters.duration, [5]));
        } else if (model === "kling-v2-1-pro" || model === "kling-v2-5-pro" || model === "kling-v2-6-pro") {
            payload.image = imgDataUrl;
            payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
        } else if (model.startsWith("wan-i2v") || model === "wan-2-5-i2v-720p") {
            payload.image = imgDataUrl;
            payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10, 15]));
        } else if (model === "pixverse-v5" || model === "seedance-pro" || model === "runway-gen4-turbo") {
            payload.image_url = imgDataUrl;
            payload.duration = String(this.snapDuration(model, parameters.duration, [5, 8]));
        } else if (model === "ltx-video-2-pro") {
            payload.image_url = imgDataUrl;
            payload.duration = this.snapDuration(model, parameters.duration, [6, 8, 10]);
            payload.resolution = "1080p";
            payload.fps = 25;
        } else {
            payload.image = imgDataUrl;
            payload.duration = String(parameters.duration || 5);
        }

        this.log("info", `Generating video [${model}]`, { params: { ...payload, image: payload.image ? "[BASE64]" : undefined, first_frame: payload.first_frame ? "[BASE64]" : undefined, first_frame_image: payload.first_frame_image ? "[BASE64]" : undefined, image_url: payload.image_url ? "[BASE64_URL]" : undefined } });

        const res = await this.client.post(ep.create, payload, { headers: { "Content-Type": "application/json" } });
        const taskId = res.data?.data?.task_id || res.data?.data?.id || res.data?.id;
        if (!taskId) throw new Error(`No task_id in response: ${JSON.stringify(res.data)}`);

        const result = await this.pollTaskStatus(ep.poll, taskId);
        return {
            model, taskId,
            videoUrl: this.extractVideoUrl(result),
            status: result.status || "completed",
            parameters,
            generationTime: (Date.now() - startTime) / 1000,
            metadata: result
        };
    }

    // ---------- TEXT TO VIDEO ----------
    async generateVideoFromText(model, prompt, parameters = {}) {
        this._aborted = false;
        const startTime = Date.now();
        const ep = this.getEndpoint(model);
        if (!ep) throw new Error(`Unknown model: ${model}`);

        const payload = { prompt };

        if (model === "minimax-hailuo-2-3") {
            payload.duration = 6;
            payload.prompt_optimizer = true;
        } else if (model === "kling-v2-1-pro") {
            payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10]));
            if (parameters.aspect_ratio) payload.aspect_ratio = this.mapAspectRatio(model, parameters.aspect_ratio);
        } else if (model === "ltx-video-2-pro") {
            payload.duration = this.snapDuration(model, parameters.duration, [6, 8, 10]);
            payload.resolution = "1080p";
            payload.fps = 25;
            payload.generate_audio = false;
        } else if (model.startsWith("wan-t2v")) {
            payload.duration = String(this.snapDuration(model, parameters.duration, [5, 10, 15]));
            if (parameters.aspect_ratio) payload.aspect_ratio = parameters.aspect_ratio;
        }

        this.log("info", `Generating text-to-video [${model}]`, { payload });

        const res = await this.client.post(ep.create, payload, { headers: { "Content-Type": "application/json" } });
        const taskId = res.data?.data?.task_id || res.data?.data?.id || res.data?.id;
        if (!taskId) throw new Error(`No task_id in response: ${JSON.stringify(res.data)}`);

        const result = await this.pollTaskStatus(ep.poll, taskId);
        return {
            model, taskId,
            videoUrl: this.extractVideoUrl(result),
            status: result.status || "completed",
            parameters: { ...parameters, prompt },
            generationTime: (Date.now() - startTime) / 1000,
            metadata: result
        };
    }

    // ---------- IMAGE GENERATION ----------
    async generateImage(model, prompt, parameters = {}) {
        this._aborted = false;
        const startTime = Date.now();
        const ep = this.getEndpoint(model);
        if (!ep) throw new Error(`Unknown model: ${model}`);

        const payload = { prompt };
        if (parameters.aspect_ratio) payload.aspect_ratio = this.mapAspectRatio(model, parameters.aspect_ratio, "image");
        if (model === "mystic") { payload.styling = { style: "photo-realism" }; }

        this.log("info", `Generating image [${model}]`, { payload });

        const res = await this.client.post(ep.create, payload, { headers: { "Content-Type": "application/json" } });
        const taskId = res.data?.data?.task_id || res.data?.data?.id || res.data?.id;
        if (!taskId) throw new Error(`No task_id in response: ${JSON.stringify(res.data)}`);

        const result = await this.pollTaskStatus(ep.poll, taskId);
        return {
            model, taskId,
            imageUrl: this.extractImageUrl(result),
            status: result.status || "completed",
            parameters: { ...parameters, prompt },
            generationTime: (Date.now() - startTime) / 1000,
            metadata: result,
            isImage: true
        };
    }

    // ---------- POLL ----------
    async pollTaskStatus(pollEp, taskId, maxAttempts = 120) {
        let attempts = 0;
        let lastStatus = null;
        this.log("info", `Polling task ${taskId}...`);

        while (attempts < maxAttempts) {
            if (this._aborted) throw new Error("Generation cancelled by user");

            try {
                const res = await this.client.get(`${pollEp}/${taskId}`);
                const data = res.data?.data || res.data;
                const status = (data?.status || "").toLowerCase();

                if (status !== lastStatus) {
                    this.log("info", `Task ${taskId} → ${status}`, { progress: data?.progress });
                    lastStatus = status;
                }

                if (["completed", "succeeded"].includes(status)) {
                    this.log("success", `Task ${taskId} completed!`);
                    return data;
                }
                if (["failed", "error"].includes(status)) {
                    throw new Error(`Task failed: ${data?.error || JSON.stringify(data)}`);
                }

                await new Promise(r => setTimeout(r, 5000));
                attempts++;
            } catch (err) {
                const s = err.response?.status;
                if (s === 404 || s >= 500) {
                    this.log("warning", `Poll ${taskId}: ${s}, retrying...`);
                    await new Promise(r => setTimeout(r, 5000));
                    attempts++;
                } else throw err;
            }
        }
        throw new Error(`Timeout waiting for task ${taskId}`);
    }

    // ---------- URL EXTRACTORS ----------
    extractVideoUrl(data) {
        return data?.video_url || data?.url
            || (data?.generated && data.generated[0])
            || data?.data?.video_url || data?.data?.url || null;
    }
    extractImageUrl(data) {
        return data?.image_url || data?.url
            || (data?.generated && data.generated[0])
            || (data?.data?.generated && data.data.generated[0]) || null;
    }

    // ---------- VIDEO DOWNLOAD ----------
    async downloadVideo(videoUrl, outputPath) {
        const axios2 = require("axios");
        const fs = require("fs");
        const res = await axios2.get(videoUrl, {
            responseType: "arraybuffer",
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                "Accept": "*/*",
                "Referer": "https://api.freepik.com/"
            }
        });
        const first = Buffer.from(res.data.slice(0, 10)).toString().toLowerCase();
        if (first.includes("<html")) throw new Error("CDN returned HTML instead of video (Access Denied)");
        require("fs").promises.writeFile(outputPath, res.data);
        return outputPath;
    }
}

module.exports = FreepikClient;