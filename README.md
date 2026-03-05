# Freepik AI Video Studio

> Professional desktop application for testing and comparing Freepik AI video generation models — built with Electron.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/electron-28.0.0-47848f.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16-green.svg)

---

## Features

### 3 Dedicated Generation Tabs
| Tab | Models | Description |
|-----|--------|-------------|
| **Text → Video** | WAN 2.6 t2v 720p / 1080p | Generate video purely from a text prompt |
| **Text + Image → Video** | Kling 2.1 Pro, MiniMax Hailuo 2.3, LTX Video 2.0 Pro | Use text + image together |
| **Image → Video** | Kling O1 Pro, Kling O1 Std, Kling 2.0, Kling 2.6 Pro, WAN 2.5/2.6, PixVerse V5 | Animate a still image |

### App Highlights
- Professional dark UI with sidebar navigation
- Model info cards with free-tier limits displayed
- Single model test OR compare ALL models in parallel
- Real-time API logs panel (collapsible)
- Video preview + one-click download
- Full generation history

---

## Prerequisites
- Node.js v16+
- Freepik API key → [freepik.com/developers](https://www.freepik.com/developers/dashboard)
- (Optional) ImgBB API key for LTX Video 2.0 Pro and PixVerse V5

---

## Installation

```bash
git clone https://github.com/silom2000/freepik-ai-studio.git
cd freepik-ai-studio
npm install
```

Create a `.env` file in the root:
```env
FREEPIK_API_KEY=your_freepik_api_key_here
IMGBB_API_KEY=your_imgbb_api_key_here
```

---

## Usage

```bash
npm start
```

1. Choose a **Generation Mode** tab in the sidebar (Text / Text+Image / Image)
2. Select **Single** or **Compare All** mode
3. Pick a model from the dropdown (or click a model card)
4. Enter your prompt and/or upload an image
5. Set duration, aspect ratio, motion prompt
6. Click **Generate Video**

---

## Supported Models

### Text to Video
| Model | Free Limit | Resolution | Duration |
|-------|-----------|------------|----------|
| WAN 2.6 t2v 720p | 20/day | 720p | 5-15s |
| WAN 2.6 t2v 1080p | 11/day | 1080p | 5-15s |

### Text + Image to Video
| Model | Free Limit | Resolution | Duration |
|-------|-----------|------------|----------|
| Kling 2.1 Pro | 11/day | HD | 5-10s |
| MiniMax Hailuo 2.3 | 11/day | 1080p | 6s |
| LTX Video 2.0 Pro | 5/day | 4K | 6-10s |

### Image to Video
| Model | Free Limit | Resolution | Duration |
|-------|-----------|------------|----------|
| Kling O1 Pro | 5/day | HD | 5-10s |
| Kling O1 Standard | 5/day | HD | 5-10s |
| Kling 2.0 | 5/day | HD | 5s |
| Kling 2.6 Pro | 11/day | HD | 5-10s |
| WAN 2.5 i2v 720p | 20/day | 720p | 5-10s |
| WAN 2.6 i2v 720p | 20/day | 720p | 5-15s |
| WAN 2.6 i2v 1080p | 11/day | 1080p | 5-15s |
| PixVerse V5 | 125/day | up to 1080p | 5-8s |

---

## Results Storage

```
results/
├── kling-o1-pro_2026-02-10T13-45-30/
│   ├── video.mp4
│   └── metadata.json
└── index.json
```

---

## Development

```bash
# Run with DevTools open
$env:NODE_ENV="development"; npm start

# Build distributable
npm run build
```

---

## License

MIT © [silom2000](https://github.com/silom2000)