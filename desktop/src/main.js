import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import RPC from 'discord-rpc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Use app userData for logs (safe in ASAR production builds)
const LOG_DIR = app.isPackaged ? app.getPath('userData') : __dirname;
const LOG_FILE = path.join(LOG_DIR, 'debug.log');
function logToFile(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) { /* ignore */ }
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
  'com.duolingo': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/duolingo.png',
  'com.soundcloud.android': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/soundcloud.png',
  'com.zhiliaoapp.musically': 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/tiktok.png',
};

let mainWindow = null;
let tray = null;
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
    // icon will use electron default
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

function createTray() {
  // Create a programmatic tray icon (yellow on transparent, 16x16)
  const trayIcon = nativeImage.createFromDataURL(
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA2ElEQVQ4T2NkoBAwUqifgWoGMDIyiv7//3/Z////TYl1BdgLjIz/FzEwMIh8/Phx+d27d5mINQTsBUZGpkX//zNIMDAwMH79+nX5nTt3mIg1BOIF/P//S/z//18CpPj///8MX79+Xf7//38mokMB7AX8BjAy/l/EwMAgSmgUgbzAwMDABIpEkGaQK0C0yH8GBgZikCjIC6AowOUFBgaG/4wMDIxMhNRTzQCquoJxEdj5/5cwMDAokhIKYC+QGgq4vICrVhZ5gdoGMBIbqeR4gWqhQHIaoBQAAKnVfhGVHnNFAAAAAElFTkSuQmCC'
  );

  tray = new Tray(trayIcon);
  tray.setToolTip('Butterfly — Discord Mobile Presence');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Butterfly',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: `Discord RPC: ${rpcConnected ? '🟢 Connected' : '🔴 Disconnected'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Reconnect Discord',
      click: () => {
        initDiscordRPC();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Butterfly',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show Butterfly',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: `Discord RPC: ${rpcConnected ? '🟢 Connected' : '🔴 Disconnected'}`,
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Reconnect Discord',
      click: () => {
        initDiscordRPC();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Butterfly',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);
}

function sendRpcStatusToUI(status, details = '') {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('DISCORD_RPC_STATUS_CHANGE', { status, details });
  }
  updateTrayMenu();
}

function initDiscordRPC() {
  logToFile('Initializing Discord RPC...');
  try {
    // Close old client if exists
    if (rpcClient) {
      try { rpcClient.destroy(); } catch (e) { /* ignore */ }
      rpcClient = null;
    }

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
    // Use dynamic logoUrl if provided, fallback to brand map, then default Android icon
    const logoUrl = data.logoUrl || APP_BRAND_LOGOS[data.packageName] || 'https://raw.githubusercontent.com/walkxcode/dashboard-icons/main/png/android.png';

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

// Properly handle quit lifecycle
app.on('before-quit', () => {
  app.isQuitting = true;
});

app.whenReady().then(() => {
  createWindow();
  createTray();
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
