const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

const DOWNLOAD_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://api.freepik.com/'
};

class ResultsManager {
    constructor(resultsDir) {
        this.resultsDir = resultsDir;
        this.indexPath = path.join(resultsDir, 'index.json');
        this.init();
    }

    getFormattedTimestamp() {
        const now = new Date();
        const dd = String(now.getDate()).padStart(2, '0');
        const mm = String(now.getMonth() + 1).padStart(2, '0');
        const yy = String(now.getFullYear()).slice(-2);
        const hh = String(now.getHours()).padStart(2, '0');
        const min = String(now.getMinutes()).padStart(2, '0');
        return `${dd}.${mm}.${yy}.${hh}.${min}`;
    }

    async init() {
        try {
            await fs.mkdir(this.resultsDir, { recursive: true });

            // Create index if it doesn't exist
            try {
                await fs.access(this.indexPath);
            } catch {
                await fs.writeFile(this.indexPath, JSON.stringify({ tests: [] }, null, 2));
            }
        } catch (error) {
            console.error('Failed to initialize results directory:', error);
        }
    }

    async saveResult(result) {
        try {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const testId = `${result.model}_${timestamp}`;
            const testDir = path.join(this.resultsDir, testId);

            await fs.mkdir(testDir, { recursive: true });

            // Download video
            let videoPath = null;
            if (result.videoUrl) {
                const videoFilename = `video_${this.getFormattedTimestamp()}.mp4`;
                videoPath = path.join(testDir, videoFilename);
                const response = await axios.get(result.videoUrl, {
                    responseType: 'arraybuffer',
                    headers: DOWNLOAD_HEADERS
                });

                // Check if we didn't get an HTML error instead of a video
                const firstBytes = Buffer.from(response.data.slice(0, 10)).toString().toLowerCase();
                if (firstBytes.includes('<html')) {
                    throw new Error('Received HTML instead of video data (Access Denied)');
                }

                await fs.writeFile(videoPath, response.data);
            }

            // Save metadata
            const metadata = {
                testId,
                model: result.model,
                timestamp: new Date().toISOString(),
                generationTime: result.generationTime,
                parameters: result.parameters,
                status: result.status,
                videoPath: videoPath ? path.relative(this.resultsDir, videoPath) : null,
                videoUrl: result.videoUrl,
                rawMetadata: result.metadata
            };

            await fs.writeFile(
                path.join(testDir, 'metadata.json'),
                JSON.stringify(metadata, null, 2)
            );

            // Update index
            await this.updateIndex(metadata);

            return {
                ...metadata,
                videoPath: videoPath
            };
        } catch (error) {
            console.error('Failed to save result:', error);
            throw error;
        }
    }

    async updateIndex(metadata) {
        try {
            const indexData = await this.getIndex();
            indexData.tests.unshift({
                testId: metadata.testId,
                model: metadata.model,
                timestamp: metadata.timestamp,
                generationTime: metadata.generationTime,
                status: metadata.status,
                videoPath: metadata.videoPath,
                parameters: metadata.parameters
            });

            // Keep only last 100 tests in index
            if (indexData.tests.length > 100) {
                indexData.tests = indexData.tests.slice(0, 100);
            }

            await fs.writeFile(this.indexPath, JSON.stringify(indexData, null, 2));
        } catch (error) {
            console.error('Failed to update index:', error);
        }
    }

    async getIndex() {
        try {
            const data = await fs.readFile(this.indexPath, 'utf8');
            return JSON.parse(data);
        } catch {
            return { tests: [] };
        }
    }

    async getHistory(limit = 50) {
        let history = await this.getIndex();
        let tests = history.tests.slice(0, limit);

        // Convert to absolute paths and repair if needed
        return Promise.all(tests.map(async item => {
            if (item.videoPath) {
                return {
                    ...item,
                    videoPath: path.resolve(this.resultsDir, item.videoPath)
                };
            }

            // Try to repair if video is missing but metadata exists
            if (!item.videoPath && item.status === 'COMPLETED') {
                const details = await this.getTestDetails(item.testId);
                if (details && details.videoPath) {
                    return {
                        ...item,
                        videoPath: details.videoPath
                    };
                }
            }

            return item;
        }));
    }

    async repairHistory() {
        const index = await this.getIndex();
        let repaired = false;

        for (const item of index.tests) {
            if (!item.videoPath && item.status === 'COMPLETED') {
                try {
                    const testDir = path.join(this.resultsDir, item.testId);
                    const metadataPath = path.join(testDir, 'metadata.json');
                    const data = await fs.readFile(metadataPath, 'utf8');
                    const metadata = JSON.parse(data);

                    const videoUrl = metadata.videoUrl || (metadata.rawMetadata && metadata.rawMetadata.generated && metadata.rawMetadata.generated[0]);

                    if (videoUrl) {
                        const videoFilename = `video_${this.getFormattedTimestamp()}.mp4`;
                        const videoPath = path.join(testDir, videoFilename);
                        console.log(`Repairing history: Downloading video for ${item.testId} as ${videoFilename}...`);
                        const response = await axios.get(videoUrl, {
                            responseType: 'arraybuffer',
                            headers: DOWNLOAD_HEADERS
                        });

                        // Check if we didn't get an HTML error
                        const firstBytes = Buffer.from(response.data.slice(0, 10)).toString().toLowerCase();
                        if (firstBytes.includes('<html')) {
                            console.warn(`Repair for ${item.testId} failed: CDN returned HTML (Access Denied)`);
                            continue;
                        }

                        await fs.writeFile(videoPath, response.data);

                        // Update metadata file
                        metadata.videoPath = path.relative(this.resultsDir, videoPath);
                        metadata.videoUrl = videoUrl;
                        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

                        // Update index item
                        item.videoPath = metadata.videoPath;
                        repaired = true;
                    }
                } catch (err) {
                    console.error(`Failed to repair item ${item.testId}:`, err);
                }
            }
        }

        if (repaired) {
            await fs.writeFile(this.indexPath, JSON.stringify(index, null, 2));
        }
        return repaired;
    }

    async getTestDetails(testId) {
        try {
            const testDir = path.join(this.resultsDir, testId);
            const metadataPath = path.join(testDir, 'metadata.json');
            const data = await fs.readFile(metadataPath, 'utf8');
            const metadata = JSON.parse(data);

            // Add full video path
            if (metadata.videoPath) {
                metadata.videoPath = path.join(this.resultsDir, metadata.videoPath);
            }

            return metadata;
        } catch (error) {
            console.error('Failed to get test details:', error);
            return null;
        }
    }
}

module.exports = ResultsManager;
