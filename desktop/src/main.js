import { app, BrowserWindow, Tray, Menu, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import RPC from 'discord-rpc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.join(__dirname, 'debug.log');
function logToFile(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.appendFileSync(LOG_FILE, line);
  console.log(line.trim());
}

// Official Discord Application Client ID for Butterfly
const DISCORD_CLIENT_ID = '1532431212407164968';

// High resolution CDN brand logos for Discord Rich Presence
const APP_BRAND_LOGOS = {
  'com.google.android.youtube': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/youtube.png',
  'com.spotify.music': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/spotify.png',
  'com.netflix.mediaclient': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/netflix.png',
  'tv.twitch.android.app': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/twitch.png',
  'com.instagram.android': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/instagram.png',
  'com.reddit.frontpage': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/reddit.png',
  'com.whatsapp': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/whatsapp.png',
};

let mainWindow = null;
let rpcClient = null;
let rpcConnected = false;

function createWindow() {
  logToFile('Creating BrowserWindow...');
  mainWindow = new BrowserWindow({
    width: 850,
    height: 580,
    resizable: false,
    frame: true,
    title: 'Butterfly 🦋 — Discord Mobile Presence',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.on('did-finish-load', () => {
    logToFile('Window loaded');
    sendRpcStatusToUI(rpcConnected ? 'connected' : 'disconnected');
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });
}

function sendRpcStatusToUI(status, details = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('DISCORD_RPC_STATUS_CHANGE', { status, details });
  }
}

function initDiscordRPC() {
  logToFile('Initializing Discord RPC...');
  try {
    RPC.register(DISCORD_CLIENT_ID);
    rpcClient = new RPC.Client({ transport: 'ipc' });

    rpcClient.on('ready', () => {
      logToFile('[Discord RPC] Connected successfully to Discord Client!');
      rpcConnected = true;
      sendRpcStatusToUI('connected', `Application ID: ${DISCORD_CLIENT_ID}`);

      // Standby activity
      updateDiscordPresence({
        appName: 'Butterfly Mobile',
        packageName: 'com.butterfly.app',
        startedAt: Date.now(),
      });
    });

    rpcClient.on('disconnected', () => {
      logToFile('[Discord RPC] Disconnected from Discord Client');
      rpcConnected = false;
      sendRpcStatusToUI('disconnected', 'Discord Client Disconnected');
    });

    rpcClient.login({ clientId: DISCORD_CLIENT_ID }).catch((err) => {
      logToFile(`[Discord RPC] Login error: ${err.message}`);
      rpcConnected = false;
      sendRpcStatusToUI('disconnected', err.message);
    });
  } catch (err) {
    logToFile(`[Discord RPC Exception] ${err.message}`);
    rpcConnected = false;
    sendRpcStatusToUI('disconnected', err.message);
  }
}

function updateDiscordPresence(data) {
  if (!rpcClient || !rpcConnected) {
    logToFile(`Cannot set activity for ${data.appName} - RPC not connected`);
    return;
  }

  logToFile(`Updating Discord Presence: ${data.appName} (${data.packageName})`);

  try {
    if (!data.appName || data.clear) {
      rpcClient.clearActivity();
      logToFile('[Discord RPC] Cleared Activity');
      return;
    }

    const startSec = Math.floor((data.startedAt || Date.now()) / 1000);
    const logoUrl = APP_BRAND_LOGOS[data.packageName] || 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/android.png';

    // Format presence payload matching exact requested layout:
    // Line 1: Details -> "Netflix"
    // Line 2: State -> "On Android Phone"
    // Large Image: Brand Logo URL
    const activityPayload = {
      details: data.appName,
      state: 'On Android Phone',
      startTimestamp: startSec,
      largeImageKey: logoUrl,
      largeImageText: `${data.appName} on Phone`,
      instance: false,
    };

    rpcClient.setActivity(activityPayload)
      .then(() => {
        logToFile(`SUCCESS: Presence set to "${data.appName}" with logo ${logoUrl}`);
      })
      .catch(err => {
        logToFile(`ERROR setting Discord status: ${err.message}`);
      });

  } catch (err) {
    logToFile(`SYNC EXCEPTION setting status: ${err.message}`);
  }
}

// IPC Listeners from Renderer UI
ipcMain.on('UPDATE_PRESENCE', (event, data) => {
  logToFile(`IPC RECEIVED UPDATE_PRESENCE: ${JSON.stringify(data)}`);
  updateDiscordPresence(data);
});

ipcMain.on('RETRY_DISCORD_RPC', () => {
  logToFile('IPC RECEIVED RETRY_DISCORD_RPC');
  initDiscordRPC();
});

ipcMain.on('GET_RPC_STATUS', () => {
  sendRpcStatusToUI(rpcConnected ? 'connected' : 'disconnected');
});

app.whenReady().then(() => {
  createWindow();
  initDiscordRPC();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
