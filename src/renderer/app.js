const { ipcRenderer } = require("electron");

// ══════════════ MODEL REGISTRY (from official docs + rate limits) ══════════════
const MODELS = {
  // IMAGE GENERATION
  "mystic":             { name:"Mystic",           tab:"text2image",     limit:125, desc:"Ultra-realistic · Freepik exclusive", color:"#10b981" },
  "flux-kontext-pro":   { name:"Flux Kontext Pro", tab:"text2image",     limit:100, desc:"Context-aware generation",            color:"#10b981" },
  "flux-2-pro":         { name:"Flux 2 Pro",       tab:"text2image",     limit:100, desc:"Professional grade",                  color:"#10b981" },
  "flux-2-turbo":       { name:"Flux 2 Turbo",     tab:"text2image",     limit:100, desc:"Speed-optimized",                     color:"#10b981" },
  "flux-2-klein":       { name:"Flux 2 Klein",     tab:"text2image",     limit:100, desc:"Sub-second · 4 references",           color:"#10b981" },
  "seedream-4-5":       { name:"Seedream 4.5",     tab:"text2image",     limit:500, desc:"4K · Latest Seedream",                color:"#10b981" },

  // TEXT TO VIDEO
  "wan-t2v-720p":       { name:"WAN 2.6 t2v 720p", tab:"text2video",    limit:20,  desc:"720p · 5-15s",                        color:"#06b6d4" },
  "wan-t2v-1080p":      { name:"WAN 2.6 t2v 1080p",tab:"text2video",    limit:11,  desc:"1080p · 5-15s",                       color:"#06b6d4" },

  // TEXT + IMAGE TO VIDEO
  "kling-v2-1-pro":     { name:"Kling 2.1 Pro",    tab:"text-img2video", limit:11,  desc:"5-10s · Cinematic",                   color:"#f59e0b" },
  "minimax-hailuo-02":  { name:"MiniMax Hailuo 02", tab:"text-img2video", limit:11,  desc:"1080p · 6s · HD",                    color:"#f59e0b" },
  "minimax-hailuo-2-3": { name:"MiniMax Hailuo 2.3",tab:"text-img2video", limit:5,   desc:"Latest Hailuo · 1080p",              color:"#f59e0b" },
  "ltx-video-2-pro":    { name:"LTX Video 2.0 Pro", tab:"text-img2video", limit:5,   desc:"4K · 6-10s",                        color:"#f59e0b" },

  // IMAGE TO VIDEO
  "kling-o1-pro":       { name:"Kling O1 Pro",      tab:"img2video",     limit:5,   desc:"Logic & Motion · 5-10s",              color:"#a855f7" },
  "kling-v2-5-pro":     { name:"Kling 2.5 Pro",     tab:"img2video",     limit:11,  desc:"Cinematic · Enhanced Motion",          color:"#a855f7" },
  "kling-v2-6-pro":     { name:"Kling 2.6 Pro",     tab:"img2video",     limit:11,  desc:"Motion Control · Latest",             color:"#a855f7" },
  "wan-i2v-720p":       { name:"WAN 2.6 i2v 720p",  tab:"img2video",     limit:20,  desc:"720p · 5-15s",                        color:"#a855f7" },
  "wan-i2v-1080p":      { name:"WAN 2.6 i2v 1080p", tab:"img2video",     limit:11,  desc:"1080p · 5-15s",                       color:"#a855f7" },
  "wan-2-5-i2v-720p":   { name:"WAN 2.5 i2v 720p",  tab:"img2video",     limit:20,  desc:"720p · 5-10s",                        color:"#a855f7" },
  "runway-gen4-turbo":  { name:"Runway Gen4 Turbo",  tab:"img2video",     limit:11,  desc:"Fast & Creative",                    color:"#a855f7" },
  "seedance-pro":       { name:"Seedance Pro",       tab:"img2video",     limit:10,  desc:"ByteDance · 1080p",                   color:"#a855f7" },
  "pixverse-v5":        { name:"PixVerse V5",        tab:"img2video",     limit:125, desc:"Creative FX · up to 1080p",           color:"#a855f7" },
  "kling-v2":           { name:"Kling 2.0",          tab:"img2video",     limit:5,   desc:"Classic · 5s",                       color:"#a855f7" }
};

const TABS = {
  "text2image":     { title:"Image Generation",      desc:"Create stunning AI images from text",         input:"text"  },
  "text2video":     { title:"Text to Video",          desc:"Generate video purely from a text prompt",    input:"text"  },
  "text-img2video": { title:"Text + Image to Video",  desc:"Combine text prompt with a reference image",  input:"both"  },
  "img2video":      { title:"Image to Video",         desc:"Animate a still image into a video",          input:"image" }
};

// ══════════════ STATE ══════════════
let currentTab       = "text2image";
let currentMode      = "single";
let selectedImageData = null;
let isGenerating     = false;
let isCancelling     = false;

// ══════════════ DOM ══════════════
const $ = id => document.getElementById(id);

// ══════════════ INIT ══════════════
async function init() {
  setupListeners();
  switchTab("text2image");
  const has = await ipcRenderer.invoke("check-api-key");
  $("apiStatus").className = "api-indicator " + (has ? "connected" : "disconnected");
  $("apiStatus").title = has ? "API Connected" : "API Key Missing — add to .env";
}

// ══════════════ LISTENERS ══════════════
function setupListeners() {
  document.querySelectorAll(".nav-tab").forEach(b =>
    b.addEventListener("click", () => switchTab(b.dataset.tab))
  );

  document.querySelectorAll(".mode-btn").forEach(b =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      currentMode = b.dataset.mode;
      updateSidebar();
    })
  );

  $("imageUploadArea").addEventListener("click", async () => {
    const res = await ipcRenderer.invoke("select-image");
    if (!res) return;
    selectedImageData = res.data;
    $("imagePreview").src = `data:image/jpeg;base64,${res.data}`;
    $("imagePreview").classList.remove("hidden");
    $("uploadIdle").classList.add("hidden");
  });

  $("generateBtn").addEventListener("click", handleGenerate);
  $("stopBtn").addEventListener("click", handleStop);

  $("toggleLogsBtn").addEventListener("click", () => {
    $("logsPanel").classList.toggle("collapsed");
    $("toggleLogsBtn").textContent = $("logsPanel").classList.contains("collapsed") ? "▼" : "▲";
  });

  $("clearLogsBtn").addEventListener("click", () => {
    $("logsContent").innerHTML = "";
    addLog({ type:"info", message:"Logs cleared", timestamp: new Date().toISOString() });
  });

  $("historyBtn").addEventListener("click", showHistory);

  // one listener on select — no duplication
  $("modelSelect").addEventListener("change", syncModelInfo);

  ipcRenderer.on("api-log", (_, log) => addLog(log));
}

// ══════════════ TAB SWITCH ══════════════
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const m = TABS[tab];
  $("pageTitle").textContent  = m.title;
  $("pageDesc").textContent   = m.desc;
  rebuildSelect(tab);
  rebuildCards(tab);
  updateSidebar();
  showEmptyState();
}

function rebuildSelect(tab) {
  const sel = $("modelSelect");
  sel.innerHTML = "";
  Object.entries(MODELS)
    .filter(([, m]) => m.tab === tab)
    .forEach(([key, m]) => {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${m.name}  —  ${m.limit}/day free`;
      sel.appendChild(opt);
    });
  syncModelInfo();
}

function syncModelInfo() {
  const m = MODELS[$("modelSelect").value];
  if (!m) return;
  $("freeLimitText").textContent = `${m.limit} requests / day`;
  $("modelInfo").classList.remove("hidden");
  // sync card highlight
  document.querySelectorAll(".model-card").forEach(c =>
    c.classList.toggle("selected", c.dataset.model === $("modelSelect").value)
  );
}

function rebuildCards(tab) {
  const box = $("modelsOverview");
  box.innerHTML = "";
  Object.entries(MODELS)
    .filter(([, m]) => m.tab === tab)
    .forEach(([key, m]) => {
      const card = document.createElement("div");
      card.className = "model-card";
      card.dataset.model = key;
      card.innerHTML = `
        <span class="mc-dot" style="background:${m.color}; box-shadow:0 0 6px ${m.color}55"></span>
        <div>
          <div class="mc-name">${m.name}</div>
          <div class="mc-meta">${m.desc}</div>
        </div>
        <span class="mc-limit">${m.limit}/day</span>`;
      card.addEventListener("click", () => {
        $("modelSelect").value = key;
        syncModelInfo();
      });
      box.appendChild(card);
    });
  // select first card
  const first = box.querySelector(".model-card");
  if (first) first.classList.add("selected");
}

// ══════════════ SIDEBAR VISIBILITY ══════════════
function updateSidebar() {
  const inputType = TABS[currentTab].input;
  $("modelSelectionGroup").classList.toggle("hidden", currentMode === "comparison");
  $("imageUploadGroup").classList.toggle("hidden", inputType === "text");
  $("textPromptGroup").classList.toggle("hidden", inputType === "image");
}

// ══════════════ GENERATE ══════════════
async function handleGenerate() {
  if (isGenerating) return;

  const model  = $("modelSelect").value;
  const prompt = $("textPrompt").value.trim();
  const inputType = TABS[currentTab].input;

  // Validation
  if (inputType !== "text" && !selectedImageData) { alert("Please upload an image."); return; }
  if (inputType !== "image" && !prompt)           { alert("Please enter a prompt."); return; }

  isGenerating = true;
  isCancelling = false;
  $("generateBtn").disabled = true;
  $("generateBtn").classList.add("hidden");
  $("stopBtn").classList.remove("hidden");
  $("progressSection").classList.remove("hidden");
  $("resultsContainer").innerHTML = "";

  const parameters = {
    duration:     parseInt($("duration").value) || 5,
    aspect_ratio: $("aspectRatio").value,
    prompt:       prompt
  };

  try {
    if (currentMode === "single") {
      await generateSingle(model, parameters, prompt);
    } else {
      await generateComparison(parameters, prompt);
    }
  } catch (err) {
    if (!isCancelling) {
      showError(err.message);
    }
  } finally {
    isGenerating = false;
    isCancelling = false;
    $("generateBtn").disabled = false;
    $("generateBtn").classList.remove("hidden");
    $("stopBtn").classList.add("hidden");
    $("progressSection").classList.add("hidden");
  }
}

async function handleStop() {
  if (!isGenerating) return;
  isCancelling = true;
  $("stopBtn").disabled = true;
  updateProgress(0, "Stopping...");
  try { await ipcRenderer.invoke("cancel-generation"); } catch {}
  $("stopBtn").disabled = false;
}

async function generateSingle(model, parameters, prompt) {
  const mName = MODELS[model]?.name || model;
  updateProgress(15, `Sending request to ${mName}...`);

  let result;
  if (currentTab === "text2image") {
    result = await ipcRenderer.invoke("generate-image", { model, prompt, parameters });
  } else if (currentTab === "text2video") {
    result = await ipcRenderer.invoke("generate-video", { model, inputType: "text", inputData: prompt, parameters });
  } else if (currentTab === "img2video") {
    result = await ipcRenderer.invoke("generate-video", { model, inputType: "image", inputData: selectedImageData, parameters });
  } else {
    // text-img2video — prefer image
    if (selectedImageData) {
      result = await ipcRenderer.invoke("generate-video", { model, inputType: "image", inputData: selectedImageData, parameters });
    } else {
      result = await ipcRenderer.invoke("generate-video", { model, inputType: "text", inputData: prompt, parameters });
    }
  }

  updateProgress(100, "Done!");
  renderResult(result);
}

async function generateComparison(parameters, prompt) {
  const tabModels = Object.entries(MODELS).filter(([, m]) => m.tab === currentTab).map(([k]) => k);
  updateProgress(10, `Running ${tabModels.length} models in parallel...`);

  let inputType, inputData;
  if (currentTab === "text2video") { inputType = "text"; inputData = prompt; }
  else if (currentTab === "img2video") { inputType = "image"; inputData = selectedImageData; }
  else { inputType = selectedImageData ? "image" : "text"; inputData = selectedImageData || prompt; }

  const results = await ipcRenderer.invoke("generate-comparison", { models: tabModels, inputType, inputData, parameters });
  updateProgress(100, "All done!");

  const grid = document.createElement("div");
  grid.className = "comparison-grid";
  results.forEach(r => {
    grid.appendChild(r.status === "fulfilled" && r.data
      ? createResultCard(r.data)
      : createErrorCard(r.model, r.data?.error || "Failed"));
  });
  $("resultsContainer").innerHTML = "";
  $("resultsContainer").appendChild(grid);
}

// ══════════════ PROGRESS ══════════════
function updateProgress(pct, text) {
  $("progressFill").style.width = pct + "%";
  $("progressText").textContent = text;
}

// ══════════════ RENDER ══════════════
function showEmptyState() {
  $("resultsContainer").innerHTML = `
    <div class="empty-state">
      <div class="empty-icon-wrap">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="0.9">
          <polygon points="23,7 16,12 23,17 23,7"/><rect x="1" y="5" width="15" height="14" rx="2"/>
        </svg>
      </div>
      <p>No results yet</p>
      <small>Configure settings and click Generate</small>
    </div>`;
}

function showError(msg) {
  const d = document.createElement("div");
  d.className = "result-card error-card";
  d.innerHTML = `<div class="error-body"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${msg}</p></div>`;
  $("resultsContainer").innerHTML = "";
  $("resultsContainer").appendChild(d);
}

function renderResult(result) {
  $("resultsContainer").innerHTML = "";
  $("resultsContainer").appendChild(createResultCard(result));
}

function createResultCard(result) {
  const card = document.createElement("div");
  card.className = "result-card";
  const m     = MODELS[result.model] || {};
  const name  = m.name || result.model;
  const time  = result.generationTime ? result.generationTime.toFixed(1) + "s" : "—";

  // Media block
  let mediaHtml = "";
  if (result.isImage && result.imagePath) {
    const src = "file:///" + result.imagePath.replace(/\\/g, "/");
    mediaHtml = `<div class="media-wrap"><img src="${src}" style="width:100%;border-radius:0;display:block;max-height:400px;object-fit:contain;background:#000"/></div>`;
  } else if (result.videoPath) {
    const src = "file:///" + result.videoPath.replace(/\\/g, "/");
    mediaHtml = `<div class="video-wrap"><video controls src="${src}" preload="metadata" style="width:100%;max-height:320px;display:block"></video></div>`;
  } else {
    mediaHtml = `<div class="video-wrap" style="padding:40px;text-align:center;color:var(--text2);font-size:12px">No media available</div>`;
  }

  // Download button
  const dlBtn = (result.videoPath || result.imagePath) ? `
    <div class="result-actions-row">
      <button class="btn-download" id="dl_${result.testId}">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        ${result.isImage ? "Download Image" : "Download Video"}
      </button>
    </div>` : "";

  card.innerHTML = `
    <div class="result-header">
      <div class="result-model-name">${name}</div>
      <div class="result-time">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
        ${time}
      </div>
    </div>
    ${mediaHtml}
    <div class="result-meta">
      <div class="meta-cell"><div class="meta-cell-label">Duration</div><div class="meta-cell-val">${result.parameters?.duration || "—"}s</div></div>
      <div class="meta-cell"><div class="meta-cell-label">Aspect</div><div class="meta-cell-val">${result.parameters?.aspect_ratio || "—"}</div></div>
      <div class="meta-cell"><div class="meta-cell-label">Status</div><div class="meta-cell-val" style="color:var(--success)">${result.status || "done"}</div></div>
    </div>
    ${dlBtn}`;

  if (result.videoPath) {
    card.querySelector(`#dl_${result.testId}`)?.addEventListener("click", async () => {
      try {
        const ok = await ipcRenderer.invoke("download-video", result.videoPath);
        if (ok) addLog({ type:"success", message:"Video saved!", timestamp: new Date().toISOString() });
      } catch (e) { alert("Failed: " + e.message); }
    });
  }

  return card;
}

function createErrorCard(model, errMsg) {
  const card = document.createElement("div");
  card.className = "result-card error-card";
  card.innerHTML = `
    <div class="result-header"><div class="result-model-name" style="color:var(--error)">${MODELS[model]?.name || model}</div></div>
    <div class="error-body"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="1.5" opacity="0.7"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg><p>${errMsg}</p></div>`;
  return card;
}

// ══════════════ HISTORY ══════════════
async function showHistory() {
  $("progressSection").classList.remove("hidden");
  updateProgress(50, "Loading history...");
  try {
    const history = await ipcRenderer.invoke("get-results-history");
    $("resultsContainer").innerHTML = "";
    if (history && history.length) {
      const grid = document.createElement("div");
      grid.className = "comparison-grid";
      history.forEach(item => grid.appendChild(createResultCard(item)));
      $("resultsContainer").appendChild(grid);
    } else { showEmptyState(); }
  } catch (e) { alert("Failed to load history: " + e.message); }
  finally { $("progressSection").classList.add("hidden"); }
}

// ══════════════ LOGS ══════════════
function addLog(log) {
  const entry = document.createElement("div");
  entry.className = `log-entry ${log.type}`;
  const time = new Date(log.timestamp).toLocaleTimeString();
  let detail = "";
  if (log.data) {
    try {
      detail = `<div class="log-details"><pre>${JSON.stringify(log.data, null, 2)}</pre></div>`;
      entry.classList.add("has-details");
      entry.addEventListener("click", () => entry.classList.toggle("expanded"));
    } catch {}
  }
  entry.innerHTML = `<span class="log-ts">${time}</span><div style="flex:1"><span class="log-msg">${log.message}</span>${detail}</div>`;
  $("logsContent").appendChild(entry);
  $("logsContent").scrollTop = $("logsContent").scrollHeight;
}

init();