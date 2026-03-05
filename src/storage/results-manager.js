const fs = require("fs").promises;
const path = require("path");
const axios = require("axios");

const DL_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "*/*",
    "Referer": "https://api.freepik.com/"
};

class ResultsManager {
    constructor(resultsDir) {
        this.resultsDir = resultsDir;
        this.indexPath = path.join(resultsDir, "index.json");
        this.init();
    }

    async init() {
        try {
            await fs.mkdir(this.resultsDir, { recursive: true });
            try { await fs.access(this.indexPath); }
            catch { await fs.writeFile(this.indexPath, JSON.stringify({ tests: [] }, null, 2)); }
        } catch (e) { console.error("ResultsManager init failed:", e); }
    }

    ts() {
        const n = new Date();
        return [n.getDate(), n.getMonth()+1, n.getFullYear().toString().slice(-2), n.getHours(), n.getMinutes()]
            .map(v => String(v).padStart(2,"0")).join(".");
    }

    async saveResult(result) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
        const testId = `${result.model}_${timestamp}`;
        const testDir = path.join(this.resultsDir, testId);
        await fs.mkdir(testDir, { recursive: true });

        let videoPath = null;
        let imagePath = null;

        // Download video
        if (result.videoUrl) {
            const filename = `video_${this.ts()}.mp4`;
            videoPath = path.join(testDir, filename);
            try {
                const res = await axios.get(result.videoUrl, { responseType: "arraybuffer", headers: DL_HEADERS });
                const first = Buffer.from(res.data.slice(0, 10)).toString().toLowerCase();
                if (first.includes("<html")) throw new Error("CDN returned HTML (Access Denied)");
                await fs.writeFile(videoPath, res.data);
            } catch (e) {
                console.error("Video download failed:", e.message);
                videoPath = null;
            }
        }

        // Download image
        if (result.imageUrl && result.isImage) {
            const filename = `image_${this.ts()}.jpg`;
            imagePath = path.join(testDir, filename);
            try {
                const res = await axios.get(result.imageUrl, { responseType: "arraybuffer", headers: DL_HEADERS });
                await fs.writeFile(imagePath, res.data);
            } catch (e) {
                console.error("Image download failed:", e.message);
                imagePath = null;
            }
        }

        const metadata = {
            testId, model: result.model,
            timestamp: new Date().toISOString(),
            generationTime: result.generationTime,
            parameters: result.parameters,
            status: result.status,
            isImage: !!result.isImage,
            videoPath: videoPath ? path.relative(this.resultsDir, videoPath) : null,
            imagePath: imagePath ? path.relative(this.resultsDir, imagePath) : null,
            videoUrl: result.videoUrl || null,
            imageUrl: result.imageUrl || null,
            rawMetadata: result.metadata
        };

        await fs.writeFile(path.join(testDir, "metadata.json"), JSON.stringify(metadata, null, 2));
        await this.updateIndex(metadata);

        return {
            ...metadata,
            videoPath: videoPath || null,
            imagePath: imagePath || null
        };
    }

    async updateIndex(meta) {
        try {
            const data = await this.getIndex();
            data.tests.unshift({
                testId: meta.testId, model: meta.model,
                timestamp: meta.timestamp, generationTime: meta.generationTime,
                status: meta.status, isImage: meta.isImage,
                videoPath: meta.videoPath, imagePath: meta.imagePath,
                parameters: meta.parameters
            });
            if (data.tests.length > 100) data.tests = data.tests.slice(0, 100);
            await fs.writeFile(this.indexPath, JSON.stringify(data, null, 2));
        } catch (e) { console.error("updateIndex failed:", e); }
    }

    async getIndex() {
        try { return JSON.parse(await fs.readFile(this.indexPath, "utf8")); }
        catch { return { tests: [] }; }
    }

    async getHistory(limit = 50) {
        const { tests } = await this.getIndex();
        return tests.slice(0, limit).map(item => ({
            ...item,
            videoPath: item.videoPath ? path.resolve(this.resultsDir, item.videoPath) : null,
            imagePath: item.imagePath ? path.resolve(this.resultsDir, item.imagePath) : null
        }));
    }

    async repairHistory() {
        const index = await this.getIndex();
        let repaired = false;
        for (const item of index.tests) {
            if (!item.videoPath && !item.imagePath && item.status === "completed") {
                try {
                    const metaPath = path.join(this.resultsDir, item.testId, "metadata.json");
                    const meta = JSON.parse(await fs.readFile(metaPath, "utf8"));
                    const url = meta.videoUrl || meta.imageUrl;
                    if (!url) continue;
                    const isImg = !!meta.isImage;
                    const filename = isImg ? `image_${this.ts()}.jpg` : `video_${this.ts()}.mp4`;
                    const dest = path.join(this.resultsDir, item.testId, filename);
                    const res = await axios.get(url, { responseType: "arraybuffer", headers: DL_HEADERS });
                    await fs.writeFile(dest, res.data);
                    const rel = path.relative(this.resultsDir, dest);
                    if (isImg) { meta.imagePath = rel; item.imagePath = rel; }
                    else       { meta.videoPath = rel; item.videoPath = rel; }
                    await fs.writeFile(metaPath, JSON.stringify(meta, null, 2));
                    repaired = true;
                } catch (e) { console.error("Repair failed for", item.testId, e.message); }
            }
        }
        if (repaired) await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
        return repaired;
    }
}

module.exports = ResultsManager;