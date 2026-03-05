const { ipcRenderer } = require("electron");

// ═══════════════════════════ MODEL REGISTRY ═══════════════════════════
const MODELS = {
  // TEXT TO VIDEO ONLY
  "wan-t2v-720p":  { name:"WAN 2.6 t2v 720p",  tab:"text2video",      type:"text",  limit:20, desc:"720p · 5-15s",     color:"#06b6d4" },
  "wan-t2v-1080p": { name:"WAN 2.6 t2v 1080p", tab:"text2video",      type:"text",  limit:11, desc:"1080p · 5-15s",    color:"#06b6d4" },
  // TEXT + IMAGE TO VIDEO
  "kling-v2-1-pro":            { name:"Kling 2.1 Pro",         tab:"text-img2video", type:"both", limit:11, desc:"5-10s · HD",        color:"#f59e0b" },
  "minimax-hailuo-2-3-1080p":  { name:"MiniMax Hailuo 2.3",   tab:"text-img2video", type:"both", limit:11, desc:"6s · 1080p",         color:"#f59e0b" },
  "ltx-video-2-pro":           { name:"LTX Video 2.0 Pro",    tab:"text-img2video", type:"both", limit:5,  desc:"4K · 6-10s",         color:"#f59e0b" },
  // IMAGE TO VIDEO ONLY
  "kling-o1-pro":      { name:"Kling O1 Pro",      tab:"img2video", type:"image", limit:5,   desc:"5-10s · High Quality", color:"#a855f7" },
  "kling-o1-std":      { name:"Kling O1 Standard", tab:"img2video", type:"image", limit:5,   desc:"5-10s · Standard",     color:"#a855f7" },
  "kling-v2":          { name:"Kling 2.0",          tab:"img2video", type:"image", limit:5,   desc:"5s",                   color:"#a855f7" },
  "kling-v2-6-pro":    { name:"Kling 2.6 Pro",      tab:"img2video", type:"image", limit:11,  desc:"5-10s · New!",         color:"#a855f7" },
  "wan-2-5-i2v-720p":  { name:"WAN 2.5 i2v 720p",  tab:"img2video", type:"image", limit:20,  desc:"720p · 5-10s",         color:"#a855f7" },
  "wan-i2v-720p":      { name:"WAN 2.6 i2v 720p",  tab:"img2video", type:"image", limit:20,  desc:"720p · 5-15s",         color:"#a855f7" },
  "wan-i2v-1080p":     { name:"WAN 2.6 i2v 1080p", tab:"img2video", type:"image", limit:11,  desc:"1080p · 5-15s",        color:"#a855f7" },
  "pixverse-v5":       { name:"PixVerse V5",         tab:"img2video", type:"image", limit:125, desc:"5-8s · up to 1080p",   color:"#a855f7" }
};

const TAB_META = {
  "text2video":     { title:"Text to Video",         desc:"Generate videos purely from a text prompt", inputType:"text" },
  "text-img2video": { title:"Text + Image to Video", desc:"Combine a text prompt with a reference image", inputType:"both" },
  "img2video":      { title:"Image to Video",         desc:"Animate a still image into a video", inputType:"image" }
};

// ═══════════════════════════ STATE ═══════════════════════════
let currentTab      = "text2video";
let currentMode     = "single";
let currentInputType = "text";
let selectedImageData = null;
let isGenerating    = false;
let isCancelling    = false;

// ═══════════════════════════ DOM REFS ═══════════════════════════
const $ = id => document.getElementById(id);
const navTabs          = document.querySelectorAll(".nav-tab");
const modeBtns         = document.querySelectorAll(".mode-btn");
const modelSelect      = $("modelSelect");
const modelSelGroup    = $("modelSelectionGroup");
const modelInfo        = $("modelInfo");
const freeLimitText    = $("freeLimitText");
const imageUploadGroup = $("imageUploadGroup");
const textPromptGroup  = $("textPromptGroup");
const imageUploadArea  = $("imageUploadArea");
const imagePreview     = $("imagePreview");
const uploadIdle       = $("uploadIdle");
const generateBtn      = $("generateBtn");
const stopBtn          = $("stopBtn");
const progressSection  = $("progressSection");
const progressFill     = $("progressFill");
const progressText     = $("progressText");
const resultsContainer = $("resultsContainer");
const apiStatus        = $("apiStatus");
const logsPanel        = $("logsPanel");
const logsContent      = $("logsContent");
const toggleLogsBtn    = $("toggleLogsBtn");
const clearLogsBtn     = $("clearLogsBtn");
const modelsOverview   = $("modelsOverview");
const pageTitle        = $("pageTitle");
const pageDesc         = $("pageDesc");
const toggleIcon       = $("toggleIcon");

// ═══════════════════════════ INIT ═══════════════════════════
async function init() {
  await checkApiKey();
  setupEventListeners();
  switchTab("text2video");
}

async function checkApiKey() {
  const hasKey = await ipcRenderer.invoke("check-api-key");
  apiStatus.className = "api-indicator " + (hasKey ? "connected" : "disconnected");
  apiStatus.title = hasKey ? "API Connected" : "API Key Missing";
}

// ═══════════════════════════ EVENT LISTENERS ═══════════════════════════
function setupEventListeners() {
  // Nav tabs
  navTabs.forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Mode toggle
  modeBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      modeBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = btn.dataset.mode;
      updateSidebarUI();
    });
  });

  // Model select change
  modelSelect.addEventListener("change", updateModelInfo);

  // Image upload
  imageUploadArea.addEventListener("click", async () => {
    const result = await ipcRenderer.invoke("select-image");
    if (result) {
      selectedImageData = result.data;
      imagePreview.src = `data:image/jpeg;base64,${result.data}`;
      imagePreview.classList.remove("hidden");
      uploadIdle.style.display = "none";
    }
  });

  // Generate
  generateBtn.addEventListener("click", handleGenerate);
  stopBtn.addEventListener("click", handleStop);

  // Logs toggle
  toggleLogsBtn.addEventListener("click", () => {
    logsPanel.classList.toggle("collapsed");
    const collapsed = logsPanel.classList.contains("collapsed");
    toggleIcon.setAttribute("points", collapsed ? "6,9 12,15 18,9" : "18,15 12,9 6,15");
  });

  clearLogsBtn.addEventListener("click", () => {
    logsContent.innerHTML = "";
    addLogEntry({ type:"info", message:"Logs cleared", timestamp:new Date().toISOString() });
  });

  // IPC logs
  ipcRenderer.on("api-log", (_, logEntry) => addLogEntry(logEntry));

  // History
  $("historyBtn").addEventListener("click", showHistory);
}

// ═══════════════════════════ TAB SWITCHING ═══════════════════════════
function switchTab(tab) {
  currentTab = tab;

  // Update nav active state
  navTabs.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  // Update page header
  const meta = TAB_META[tab];
  pageTitle.textContent = meta.title;
  pageDesc.textContent  = meta.desc;

  // Determine input type from tab
  if (tab === "text2video") {
    currentInputType = "text";
  } else if (tab === "img2video") {
    currentInputType = "image";
  } else {
    currentInputType = "both"; // text-img2video can use both
  }

  // Rebuild model select dropdown for this tab
  rebuildModelSelect(tab);

  // Rebuild model info cards
  rebuildModelCards(tab);

  // Update sidebar visibility
  updateSidebarUI();

  // Clear results on tab change
  showEmptyState();
}

function rebuildModelSelect(tab) {
  modelSelect.innerHTML = "";
  const tabModels = Object.entries(MODELS).filter(([, m]) => m.tab === tab);
  tabModels.forEach(([key, m]) => {
    const opt = document.createElement("option");
    opt.value = key;
    opt.textContent = `${m.name}  —  ${m.limit}/day free`;
    modelSelect.appendChild(opt);
  });
  updateModelInfo();
}

function rebuildModelCards(tab) {
  modelsOverview.innerHTML = "";
  const tabModels = Object.entries(MODELS).filter(([, m]) => m.tab === tab);
  tabModels.forEach(([key, m]) => {
    const card = document.createElement("div");
    card.className = "model-card";
    card.dataset.model = key;
    card.innerHTML = `
      <span class="mc-dot" style="background:${m.color}"></span>
      <div>
        <div class="mc-name">${m.name}</div>
        <div class="mc-meta">${m.desc}</div>
      </div>
      <span class="mc-limit">${m.limit}/day</span>
    `;
    card.addEventListener("click", () => {
      document.querySelectorAll(".model-card").forEach(c => c.classList.remove("selected"));
      card.classList.add("selected");
      if (currentMode === "single") {
        modelSelect.value = key;
        updateModelInfo();
      }
    });
    modelsOverview.appendChild(card);
  });
  // Auto-select first card
  const first = modelsOverview.querySelector(".model-card");
  if (first) first.classList.add("selected");
}

// ═══════════════════════════ SIDEBAR UI ═══════════════════════════
function updateSidebarUI() {
  // Model selection only in single mode
  if (currentMode === "single") {
    modelSelGroup.classList.remove("hidden");
  } else {
    modelSelGroup.classList.add("hidden");
  }

  // Image upload visibility
  if (currentInputType === "image" || currentInputType === "both") {
    imageUploadGroup.classList.remove("hidden");
  } else {
    imageUploadGroup.classList.add("hidden");
  }

  // Text prompt visibility
  if (currentInputType === "text" || currentInputType === "both") {
    textPromptGroup.classList.remove("hidden");
  } else {
    textPromptGroup.classList.add("hidden");
  }
}

function updateModelInfo() {
  const key = modelSelect.value;
  const m = MODELS[key];
  if (m) {
    freeLimitText.textContent = `${m.limit} requests / day`;
    modelInfo.classList.remove("hidden");
    // Sync card selection
    document.querySelectorAll(".model-card").forEach(c => {
      c.classList.toggle("selected", c.dataset.model === key);
    });
  } else {
    modelInfo.classList.add("hidden");
  }
}

// ═══════════════════════════ GENERATE ═══════════════════════════
async function handleGenerate() {
  if (isGenerating) return;

  const tab = currentTab;
  const model = modelSelect.value;
  const prompt = $("textPrompt").value.trim();

  // Validation
  if ((currentInputType === "image" || currentInputType === "both") && !selectedImageData && tab !== "text2video") {
    if (tab === "img2video") {
      alert("Please upload an image first.");
      return;
    }
  }
  if ((currentInputType === "text" || currentInputType === "both") && !prompt && tab !== "img2video") {
    if (tab === "text2video") {
      alert("Please enter a text prompt.");
      return;
    }
  }

  isGenerating = true;
  isCancelling = false;
  generateBtn.disabled = true;
  generateBtn.classList.add("hidden");
  stopBtn.classList.remove("hidden");
  progressSection.classList.remove("hidden");
  resultsContainer.innerHTML = "";

  try {
    const parameters = {
      duration:     parseInt($("duration").value),
      aspect_ratio: $("aspectRatio").value,
      prompt:       $("motionPrompt").value
    };

    if (currentMode === "single") {
      await generateSingle(model, parameters);
    } else {
      await generateComparison(parameters);
    }
  } catch (err) {
    if (!isCancelling) {
      alert("Error: " + err.message);
    }
  } finally {
    isGenerating = false;
    isCancelling = false;
    generateBtn.disabled = false;
    generateBtn.classList.remove("hidden");
    stopBtn.classList.add("hidden");
    progressSection.classList.add("hidden");
  }
}

async function handleStop() {
  if (!isGenerating) return;
  isCancelling = true;
  stopBtn.disabled = true;
  updateProgress(0, "Stopping...");
  try { await ipcRenderer.invoke("cancel-generation"); } catch(e) {}
  stopBtn.disabled = false;
}

async function generateSingle(model, parameters) {
  const tab = currentTab;
  let inputType, inputData;

  if (tab === "text2video") {
    inputType = "text";
    inputData = $("textPrompt").value.trim();
  } else if (tab === "img2video") {
    inputType = "image";
    inputData = selectedImageData;
  } else {
    // text-img2video: prefer image if uploaded, else text
    if (selectedImageData) {
      inputType = "image";
      inputData = selectedImageData;
      parameters.prompt = $("textPrompt").value.trim() || parameters.prompt;
    } else {
      inputType = "text";
      inputData = $("textPrompt").value.trim();
    }
  }

  updateProgress(20, `Generating with ${MODELS[model]?.name || model}...`);

  const result = await ipcRenderer.invoke("generate-video", { model, inputType, inputData, parameters });
  updateProgress(100, "Complete!");
  displayResult(result);
}

async function generateComparison(parameters) {
  const tabModels = Object.entries(MODELS)
    .filter(([, m]) => m.tab === currentTab)
    .map(([key]) => key);

  const tab = currentTab;
  let inputType, inputData;

  if (tab === "text2video") {
    inputType = "text";
    inputData = $("textPrompt").value.trim();
    if (!inputData) { alert("Please enter a text prompt."); return; }
  } else if (tab === "img2video") {
    inputType = "image";
    inputData = selectedImageData;
    if (!inputData) { alert("Please upload an image."); return; }
  } else {
    if (selectedImageData) {
      inputType = "image"; inputData = selectedImageData;
      parameters.prompt = $("textPrompt").value.trim() || parameters.prompt;
    } else {
      inputType = "text"; inputData = $("textPrompt").value.trim();
      if (!inputData) { alert("Please enter a prompt or upload an image."); return; }
    }
  }

  updateProgress(10, `Running ${tabModels.length} models in parallel...`);

  const results = await ipcRenderer.invoke("generate-comparison", {
    models: tabModels, inputType, inputData, parameters
  });

  updateProgress(100, "All done!");
  displayComparisonResults(results);
}

// ═══════════════════════════ DISPLAY ═══════════════════════════
function updateProgress(pct, txt) {
  progressFill.style.width = pct + "%";
  progressText.textContent = txt;
}

function showEmptyState() {
  resultsContainer.innerHTML = `
    <div class="empty-state">
      <div class="empty-icon-wrap">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="23,7 16,12 23,17 23,7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
      </div>
      <p>No results yet</p>
      <small>Configure your settings and hit Generate</small>
    </div>`;
}

function displayResult(result) {
  resultsContainer.innerHTML = "";
  resultsContainer.appendChild(createResultCard(result));
}

function displayComparisonResults(results) {
  resultsContainer.innerHTML = `<div class="comparison-grid"></div>`;
  const grid = resultsContainer.querySelector(".comparison-grid");
  results.forEach(r => {
    if (r.status === "fulfilled" && r.data) {
      grid.appendChild(createResultCard(r.data));
    } else {
      grid.appendChild(createErrorCard(r.model, r.data?.error || "Generation failed"));
    }
  });
}

function createResultCard(result) {
  const card = document.createElement("div");
  card.className = "result-card";

  const m      = MODELS[result.model] || {};
  const name   = m.name || result.model;
  const normPath = result.videoPath ? result.videoPath.replace(/\\/g, "/") : null;
  const videoSrc = normPath ? `file:///${normPath}` : "";

  card.innerHTML = `
    <div class="result-header">
      <div class="result-model-name">${name}</div>
      <div class="result-time">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
        ${result.generationTime ? result.generationTime.toFixed(1) + "s" : "—"}
      </div>
    </div>
    <div class="video-wrap">
      ${result.videoPath
        ? `<video controls src="${videoSrc}" preload="metadata"></video>`
        : `<div style="padding:48px;text-align:center;color:var(--text2);font-size:12px;">Video generating...</div>`
      }
    </div>
    <div class="result-meta">
      <div class="meta-cell">
        <div class="meta-cell-label">Duration</div>
        <div class="meta-cell-val">${result.parameters?.duration || "—"}s</div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Aspect</div>
        <div class="meta-cell-val">${result.parameters?.aspect_ratio || "—"}</div>
      </div>
      <div class="meta-cell">
        <div class="meta-cell-label">Status</div>
        <div class="meta-cell-val" style="color:var(--success)">${result.status || "done"}</div>
      </div>
    </div>
    ${result.videoPath ? `
    <div class="result-actions-row">
      <button class="btn-download">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Download Video
      </button>
    </div>` : ""}
  `;

  if (result.videoPath) {
    card.querySelector(".btn-download").addEventListener("click", async () => {
      try {
        const ok = await ipcRenderer.invoke("download-video", result.videoPath);
        if (ok) alert("Video saved successfully!");
      } catch (e) {
        alert("Failed to save: " + e.message);
      }
    });
  }
  return card;
}

function createErrorCard(model, errMsg) {
  const card = document.createElement("div");
  card.className = "result-card error-card";
  const name = MODELS[model]?.name || model;
  card.innerHTML = `
    <div class="result-header">
      <div class="result-model-name" style="color:var(--error)">${name}</div>
    </div>
    <div class="error-body">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.6">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
      <p>${errMsg}</p>
    </div>`;
  return card;
}

// ═══════════════════════════ HISTORY ═══════════════════════════
async function showHistory() {
  progressSection.classList.remove("hidden");
  updateProgress(50, "Loading history...");
  try {
    const history = await ipcRenderer.invoke("get-results-history");
    resultsContainer.innerHTML = "";
    if (history && history.length > 0) {
      const grid = document.createElement("div");
      grid.className = "comparison-grid";
      history.forEach(item => grid.appendChild(createResultCard(item)));
      resultsContainer.appendChild(grid);
    } else {
      showEmptyState();
    }
  } catch (e) {
    alert("Failed to load history: " + e.message);
  } finally {
    progressSection.classList.add("hidden");
  }
}

// ═══════════════════════════ LOGS ═══════════════════════════
function addLogEntry(log) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${log.type}`;
  const time = new Date(log.timestamp).toLocaleTimeString();
  let detailsHtml = "";
  if (log.data) {
    entry.classList.add("has-details");
    try {
      detailsHtml = `<div class="log-details"><pre>${JSON.stringify(log.data, null, 2)}</pre></div>`;
      entry.addEventListener("click", () => entry.classList.toggle("expanded"));
    } catch(e) {}
  }
  entry.innerHTML = `
    <span class="log-ts">${time}</span>
    <div style="flex:1">
      <span class="log-msg">${log.message}</span>
      ${detailsHtml}
    </div>`;
  logsContent.appendChild(entry);
  logsContent.scrollTop = logsContent.scrollHeight;
}

// ═══════════════════════════ START ═══════════════════════════
init();
