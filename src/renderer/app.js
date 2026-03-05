const { ipcRenderer } = require("electron");

const MODELS = {
  // --- IMAGE GENERATION ---
  "mystic":           { name:"Mystic",          tab:"text2image", limit:125, desc:"Ultra-realistic AI",  color:"#10b981" },
  "flux-kontext-pro": { name:"Flux Kontext Pro",tab:"text2image", limit:100, desc:"Context-aware",     color:"#10b981" },
  "flux-2-pro":       { name:"Flux 2 Pro",      tab:"text2image", limit:100, desc:"Professional",      color:"#10b981" },
  "flux-2-turbo":     { name:"Flux 2 Turbo",    tab:"text2image", limit:100, desc:"Fast & Detailed",   color:"#10b981" },
  "flux-2-klein":     { name:"Flux 2 Klein",    tab:"text2image", limit:100, desc:"Sub-second gen",    color:"#10b981" },
  "seedream-4-5":     { name:"Seedream 4.5",    tab:"text2image", limit:500, desc:"4K Resolution",    color:"#10b981" },

  // --- TEXT TO VIDEO ---
  "wan-v2-6-720p":    { name:"WAN 2.6 720p",    tab:"text2video", limit:20,  desc:"5-15s · 720p",     color:"#06b6d4" },
  "wan-v2-6-1080p":   { name:"WAN 2.6 1080p",   tab:"text2video", limit:11,  desc:"5-15s · 1080p",    color:"#06b6d4" },

  // --- TEXT + IMAGE TO VIDEO ---
  "kling-v2-1-pro":   { name:"Kling 2.1 Pro",   tab:"text-img2video", limit:11, desc:"5-10s · Cinematic", color:"#f59e0b" },
  "minimax-hailuo-02":{ name:"MiniMax 02",      tab:"text-img2video", limit:11, desc:"1080p · 6s",        color:"#f59e0b" },
  "minimax-hailuo-2-3":{ name:"MiniMax 2.3",    tab:"text-img2video", limit:5,  desc:"Latest Hailuo",     color:"#f59e0b" },
  "ltx-video-2-pro":  { name:"LTX Video 2.0",   tab:"text-img2video", limit:5,  desc:"4K Quality",       color:"#f59e0b" },

  // --- IMAGE TO VIDEO ---
  "kling-o1-pro":     { name:"Kling O1 Pro",    tab:"img2video", limit:5,   desc:"Logic & Motion",    color:"#a855f7" },
  "kling-v2-5-pro":   { name:"Kling 2.5 Pro",   tab:"img2video", limit:11,  desc:"Enhanced Motion",   color:"#a855f7" },
  "kling-v2-6-pro":   { name:"Kling 2.6 Pro",   tab:"img2video", limit:11,  desc:"Motion Control",    color:"#a855f7" },
  "runway-gen4-turbo":{ name:"Runway Gen4",     tab:"img2video", limit:11,  desc:"Turbo Speed",       color:"#a855f7" },
  "seedance-pro":     { name:"Seedance Pro",    tab:"img2video", limit:10,  desc:"1080p ByteDance",   color:"#a855f7" },
  "pixverse-v5":      { name:"PixVerse V5",     tab:"img2video", limit:125, desc:"Creative AI",       color:"#a855f7" },
  "wan-2-5-i2v-720p": { name:"WAN 2.5 i2v",     tab:"img2video", limit:20,  desc:"720p Desktop",      color:"#a855f7" },
  "kling-v2":         { name:"Kling 2.0",       tab:"img2video", limit:5,   desc:"Classic Kling",      color:"#a855f7" }
};

const TAB_META = {
  "text2image":     { title:"Image Generation",    desc:"Create stunning AI images",      inputType:"text" },
  "text2video":     { title:"Text to Video",       desc:"Videos from pure text",        inputType:"text" },
  "text-img2video": { title:"Text + Image → Video", desc:"Combined generation",         inputType:"both" },
  "img2video":      { title:"Image to Video",      desc:"Animate still photos",        inputType:"image" }
};

let currentTab = "text2video";
let currentMode = "single";
let selectedImageData = null;
let isGenerating = false;

const $ = id => document.getElementById(id);

async function init() {
  setupListeners();
  switchTab("text2image");
  checkApiKey();
}

async function checkApiKey() {
  const has = await ipcRenderer.invoke("check-api-key");
  $("apiStatus").className = "api-indicator " + (has ? "connected" : "disconnected");
}

function setupListeners() {
  document.querySelectorAll(".nav-tab").forEach(b => b.addEventListener("click", () => switchTab(b.dataset.tab)));
  document.querySelectorAll(".mode-btn").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".mode-btn").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    currentMode = b.dataset.mode;
    updateUI();
  }));

  $("imageUploadArea").addEventListener("click", async () => {
    const res = await ipcRenderer.invoke("select-image");
    if (res) {
      selectedImageData = res.data;
      $("imagePreview").src = `data:image/jpeg;base64,${res.data}`;
      $("imagePreview").classList.remove("hidden");
      $("uploadIdle").classList.add("hidden");
    }
  });

  $("generateBtn").addEventListener("click", handleGenerate);
  ipcRenderer.on("api-log", (_, log) => addLog(log));
}

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  const meta = TAB_META[tab];
  $("pageTitle").textContent = meta.title;
  $("pageDesc").textContent = meta.desc;
  
  rebuildSelect(tab);
  rebuildCards(tab);
  updateUI();
}

function rebuildSelect(tab) {
  const sel = $("modelSelect");
  sel.innerHTML = "";
  Object.entries(MODELS).filter(([,m]) => m.tab === tab).forEach(([k,m]) => {
    const o = document.createElement("option");
    o.value = k; o.textContent = `${m.name} (${m.limit}/day)`; sel.appendChild(o);
  });
  sel.addEventListener("change", () => {
    const m = MODELS[sel.value];
    if (m) $("freeLimitText").textContent = `${m.limit} requests / day`;
  });
  const first = MODELS[sel.value];
  if (first) $("freeLimitText").textContent = `${first.limit} requests / day`;
  $("modelInfo").classList.remove("hidden");
}

function rebuildCards(tab) {
  const box = $("modelsOverview");
  box.innerHTML = "";
  Object.entries(MODELS).filter(([,m]) => m.tab === tab).forEach(([k,m]) => {
    const d = document.createElement("div");
    d.className = "model-card";
    d.innerHTML = `<span class="mc-dot" style="background:${m.color}"></span><div><div class="mc-name">${m.name}</div><div class="mc-meta">${m.desc}</div></div><span class="mc-limit">${m.limit}</span>`;
    d.addEventListener("click", () => { $("modelSelect").value = k; $("modelSelect").dispatchEvent(new Event("change")); });
    box.appendChild(d);
  });
}

function updateUI() {
  const type = TAB_META[currentTab].inputType;
  $("imageUploadGroup").classList.toggle("hidden", type === "text");
  $("textPromptGroup").classList.toggle("hidden", type === "image" && currentTab !== "text2image");
  $("modelSelectionGroup").classList.toggle("hidden", currentMode === "comparison");
}

async function handleGenerate() {
  if (isGenerating) return;
  const model = $("modelSelect").value;
  const prompt = $("textPrompt").value.trim();
  
  isGenerating = true;
  $("generateBtn").disabled = true;
  $("progressSection").classList.remove("hidden");
  $("progressFill").style.width = "20%";
  $("progressText").textContent = "Starting generation...";

  try {
    let res;
    const params = { duration: $("duration").value, aspect_ratio: $("aspectRatio").value };
    
    if (currentTab === "text2image") {
      res = await ipcRenderer.invoke("generate-image", { model, prompt, parameters: params });
    } else {
      const inputData = (currentTab === "text2video") ? prompt : selectedImageData;
      res = await ipcRenderer.invoke("generate-video", { model, inputType: (currentTab === "text2video" ? "text":"image"), inputData, parameters: params });
    }
    
    $("progressFill").style.width = "100%";
    $("progressText").textContent = "Finished!";
    displayResult(res);
  } catch (e) {
    alert(e.message);
  } finally {
    isGenerating = false;
    $("generateBtn").disabled = false;
  }
}

function displayResult(res) {
  const container = $("resultsContainer");
  const card = document.createElement("div");
  card.className = "result-card";
  const media = res.videoUrl ? `<video src="file:///${res.videoPath}" controls></video>` : `<img src="file:///${res.imagePath}" />`;
  card.innerHTML = `<div class="result-header"><div class="result-model-name">${res.model}</div></div><div class="video-wrap">${media}</div>`;
  container.prepend(card);
}

function addLog(log) {
  const e = document.createElement("div");
  e.className = `log-entry ${log.type}`;
  e.innerHTML = `<span class="log-ts">${new Date().toLocaleTimeString()}</span><span class="log-msg">${log.message}</span>`;
  $("logsContent").appendChild(e);
  $("logsContent").scrollTop = $("logsContent").scrollHeight;
}

init();