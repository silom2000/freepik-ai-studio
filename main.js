const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const fs = require("fs").promises;
require("dotenv").config();

const FreepikClient = require("./src/api/freepik-client");
const ResultsManager = require("./src/storage/results-manager");

let mainWindow, freepikClient, resultsManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280, height: 820,
    minWidth: 900, minHeight: 650,
    webPreferences: { nodeIntegration: true, contextIsolation: false, webSecurity: false },
    backgroundColor: "#080810",
    autoHideMenuBar: true,
    title: "Freepik AI Studio"
  });
  mainWindow.loadFile("src/renderer/index.html");
  if (process.env.NODE_ENV === "development") mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  freepikClient = new FreepikClient(process.env.FREEPIK_API_KEY);
  freepikClient.on("log", (entry) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("api-log", entry);
    if (process.env.NODE_ENV === "development") console.log(`[${entry.type.toUpperCase()}] ${entry.message}`);
  });

  resultsManager = new ResultsManager(path.join(__dirname, "results"));
  resultsManager.repairHistory().catch(e => console.error("History repair failed:", e));

  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });

// ══════════════════════════════ IPC HANDLERS ══════════════════════════════

ipcMain.handle("check-api-key", () => !!process.env.FREEPIK_API_KEY);

ipcMain.handle("select-image", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg","jpeg","png","webp"] }]
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const buf = await fs.readFile(result.filePaths[0]);
    return { path: result.filePaths[0], data: buf.toString("base64") };
  }
  return null;
});

// VIDEO GENERATION
ipcMain.handle("generate-video", async (event, { model, inputType, inputData, parameters }) => {
  try {
    let result;
    if (inputType === "image") {
      result = await freepikClient.generateVideoFromImage(model, inputData, parameters);
    } else {
      result = await freepikClient.generateVideoFromText(model, inputData, parameters);
    }
    return await resultsManager.saveResult(result);
  } catch (err) {
    console.error("generate-video error:", err.message);
    throw err;
  }
});

// IMAGE GENERATION
ipcMain.handle("generate-image", async (event, { model, prompt, parameters }) => {
  try {
    const result = await freepikClient.generateImage(model, prompt, parameters);
    return await resultsManager.saveResult(result);
  } catch (err) {
    console.error("generate-image error:", err.message);
    throw err;
  }
});

// COMPARISON MODE
ipcMain.handle("generate-comparison", async (event, { models, inputType, inputData, parameters }) => {
  const results = await Promise.allSettled(
    models.map(async (model) => {
      try {
        let result;
        if (inputType === "image") {
          result = await freepikClient.generateVideoFromImage(model, inputData, parameters);
        } else {
          result = await freepikClient.generateVideoFromText(model, inputData, parameters);
        }
        return await resultsManager.saveResult(result);
      } catch (err) {
        return { model, error: err.message };
      }
    })
  );
  return results.map((r, i) => ({ model: models[i], status: r.status, data: r.value || r.reason }));
});

// HISTORY
ipcMain.handle("get-results-history", async () => {
  try { return await resultsManager.getHistory(); } catch { return []; }
});

// CANCEL
ipcMain.handle("cancel-generation", () => {
  if (freepikClient) freepikClient.cancelGeneration();
  return true;
});

// DOWNLOAD
ipcMain.handle("download-video", async (event, sourcePath) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: path.basename(sourcePath),
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }]
    });
    if (filePath) { await fs.copyFile(sourcePath, filePath); return true; }
    return false;
  } catch (err) { throw err; }
});