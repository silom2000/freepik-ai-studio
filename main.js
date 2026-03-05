const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
require('dotenv').config();

const FreepikClient = require('./src/api/freepik-client');
const ResultsManager = require('./src/storage/results-manager');

let mainWindow;
let freepikClient;
let resultsManager;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
    backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'assets/icon.png')
  });

  mainWindow.loadFile('src/renderer/index.html');

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  // Initialize API client and storage
  freepikClient = new FreepikClient(process.env.FREEPIK_API_KEY);

  // Forward logs to renderer
  freepikClient.on('log', (logEntry) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('api-log', logEntry);
    }
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(`[${logEntry.type.toUpperCase()}] ${logEntry.message}`);
    }
  });

  resultsManager = new ResultsManager(path.join(__dirname, 'results'));

  // Repair history on startup (download missing videos if URLs exist)
  resultsManager.repairHistory().catch(err => console.error('History repair failed:', err));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers

ipcMain.handle('select-image', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const imagePath = result.filePaths[0];
    const imageBuffer = await fs.readFile(imagePath);
    return {
      path: imagePath,
      data: imageBuffer.toString('base64')
    };
  }
  return null;
});

ipcMain.handle('generate-video', async (event, options) => {
  try {
    const { model, inputType, inputData, parameters } = options;

    let result;
    if (inputType === 'image') {
      result = await freepikClient.generateVideoFromImage(model, inputData, parameters);
    } else {
      result = await freepikClient.generateVideoFromText(model, inputData, parameters);
    }

    // Save result
    const savedResult = await resultsManager.saveResult(result);

    return savedResult;
  } catch (error) {
    console.error('Video generation error:', error);
    throw error;
  }
});

ipcMain.handle('generate-comparison', async (event, options) => {
  try {
    const { models, inputType, inputData, parameters } = options;

    const results = await Promise.allSettled(
      models.map(async (model) => {
        try {
          let result;
          if (inputType === 'image') {
            result = await freepikClient.generateVideoFromImage(model, inputData, parameters);
          } else {
            result = await freepikClient.generateVideoFromText(model, inputData, parameters);
          }

          const savedResult = await resultsManager.saveResult(result);
          return savedResult;
        } catch (error) {
          return { model, error: error.message };
        }
      })
    );

    return results.map((r, i) => ({
      model: models[i],
      status: r.status,
      data: r.value || r.reason
    }));
  } catch (error) {
    console.error('Comparison generation error:', error);
    throw error;
  }
});

ipcMain.handle('get-results-history', async () => {
  try {
    return await resultsManager.getHistory();
  } catch (error) {
    console.error('Error loading history:', error);
    return [];
  }
});

ipcMain.handle('check-api-key', () => {
  return !!process.env.FREEPIK_API_KEY;
});

ipcMain.handle('cancel-generation', () => {
  if (freepikClient) {
    freepikClient.cancelGeneration();
  }
  return true;
});

ipcMain.handle('download-video', async (event, sourcePath) => {
  try {
    const filename = path.basename(sourcePath);
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: filename,
      filters: [{ name: 'MP4 Video', extensions: ['mp4'] }]
    });

    if (filePath) {
      await fs.copyFile(sourcePath, filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
});
