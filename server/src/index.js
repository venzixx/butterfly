import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import QRCode from 'qrcode';
import crypto from 'crypto';

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// In-memory data store with state management
const pairings = new Map(); // pairingId -> { code, deviceToken, desktopWs, mobileConnected, createdAt, lastActivity }
const codeToPairingId = new Map(); // 6-digit code -> pairingId
const privacySettings = new Map(); // deviceToken -> { defaultAction: 'allow', excludedApps: [] }

// Root Welcome & Health Check Route
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Butterfly Cloud Server 🦋</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #0f0c20; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; text-align: center; }
          .card { background: rgba(255,255,255,0.05); padding: 40px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
          h1 { background: linear-gradient(135deg, #a78bfa, #06b6d4); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0 0 10px 0; }
          p { color: #9ca3af; margin: 5px 0; }
          .badge { display: inline-block; background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 6px 14px; border-radius: 20px; font-weight: bold; margin-top: 15px; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>🦋 Butterfly Cloud Server</h1>
          <p>Discord Mobile Presence Relay & Device Pairing</p>
          <div class="badge">● SERVER ONLINE & READY</div>
        </div>
      </body>
    </html>
  `);
});

// App Icon Mapping table (package name / app name -> Iconify icon name)
const POPULAR_APP_ICONS = {
  'com.google.android.youtube': { name: 'YouTube', icon: 'logos:youtube-icon', category: 'video' },
  'com.spotify.music': { name: 'Spotify', icon: 'logos:spotify-icon', category: 'music' },
  'com.instagram.android': { name: 'Instagram', icon: 'logos:instagram-icon', category: 'social' },
  'com.netflix.mediaclient': { name: 'Netflix', icon: 'logos:netflix-icon', category: 'video' },
  'com.twitter.android': { name: 'X / Twitter', icon: 'logos:twitter', category: 'social' },
  'com.reddit.frontpage': { name: 'Reddit', icon: 'logos:reddit-icon', category: 'social' },
  'tv.twitch.android.app': { name: 'Twitch', icon: 'logos:twitch', category: 'stream' },
  'com.whatsapp': { name: 'WhatsApp', icon: 'logos:whatsapp-icon', category: 'chat' },
  'com.discord': { name: 'Discord', icon: 'logos:discord-icon', category: 'chat' },
  'com.duolingo': { name: 'Duolingo', icon: 'logos:duolingo-icon', category: 'education' },
  'com.mojang.minecraftpe': { name: 'Minecraft', icon: 'logos:minecraft', category: 'game' },
};

function generatePairingCode() {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `BFLY-${num}`;
}

// 1. Desktop generates pairing session (QR + Code)
app.post('/api/pair/generate', async (req, res) => {
  const pairingId = crypto.randomUUID();
  const code = generatePairingCode();
  const deviceToken = crypto.randomUUID();

  const qrPayload = JSON.stringify({
    serverUrl: req.headers.host,
    pairingId,
    code,
    deviceToken,
  });

  try {
    const qrDataUrl = await QRCode.toDataURL(qrPayload, {
      margin: 2,
      color: {
        dark: '#7C3AED',
        light: '#FFFFFF',
      },
    });

    pairings.set(pairingId, {
      pairingId,
      code,
      deviceToken,
      paired: false,
      desktopWs: null,
      mobileConnected: false,
      createdAt: Date.now(),
      lastActivity: null,
    });

    codeToPairingId.set(code, pairingId);

    console.log(`[Butterfly Server] New pairing generated: ${code} (${pairingId})`);

    res.json({
      success: true,
      pairingId,
      code,
      deviceToken,
      qrDataUrl,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate QR Code' });
  }
});

// 2. Mobile verifies code or QR token to pair
app.post('/api/pair/verify', (req, res) => {
  const { code, pairingId, deviceToken } = req.body;

  let session = null;
  if (pairingId && pairings.has(pairingId)) {
    session = pairings.get(pairingId);
  } else if (code && codeToPairingId.has(code.toUpperCase())) {
    const pId = codeToPairingId.get(code.toUpperCase());
    session = pairings.get(pId);
  }

  if (!session) {
    return res.status(404).json({ success: false, error: 'Invalid or expired pairing code' });
  }

  session.paired = true;
  session.mobileConnected = true;

  if (!privacySettings.has(session.deviceToken)) {
    privacySettings.set(session.deviceToken, {
      defaultAction: 'allow',
      excludedApps: ['com.whatsapp', 'com.banking.app'],
    });
  }

  if (session.desktopWs && session.desktopWs.readyState === WebSocket.OPEN) {
    session.desktopWs.send(JSON.stringify({
      type: 'MOBILE_PAIRED',
      paired: true,
      timestamp: Date.now(),
    }));
  }

  console.log(`[Butterfly Server] Mobile paired successfully with ${session.code}`);

  res.json({
    success: true,
    message: 'Paired successfully',
    pairingId: session.pairingId,
    deviceToken: session.deviceToken,
  });
});

// 3. Mobile posts active app details
app.post('/api/activity', (req, res) => {
  const { deviceToken, packageName, appName, customTitle } = req.body;

  if (!deviceToken) {
    return res.status(400).json({ error: 'Missing deviceToken' });
  }

  let session = null;
  for (const s of pairings.values()) {
    if (s.deviceToken === deviceToken) {
      session = s;
      break;
    }
  }

  if (!session) {
    return res.status(401).json({ error: 'Unrecognized device token. Please re-pair.' });
  }

  const userPrivacy = privacySettings.get(deviceToken) || { excludedApps: [] };
  if (userPrivacy.excludedApps.includes(packageName)) {
    console.log(`[Privacy] App ${packageName} is blacklisted by user. Skipping broadcast.`);
    
    if (session.desktopWs && session.desktopWs.readyState === WebSocket.OPEN) {
      session.desktopWs.send(JSON.stringify({
        type: 'ACTIVITY_CLEAR',
        reason: 'App blacklisted by privacy settings',
      }));
    }
    return res.json({ success: true, filtered: true, reason: 'App blacklisted by privacy settings' });
  }

  const iconInfo = POPULAR_APP_ICONS[packageName] || {
    name: appName || 'Mobile App',
    icon: 'heroicons:device-phone-mobile',
    category: 'app',
  };

  const activityPayload = {
    type: 'ACTIVITY_UPDATE',
    appName: appName || iconInfo.name,
    packageName: packageName || 'unknown.app',
    icon: iconInfo.icon,
    customTitle: customTitle || null,
    startedAt: Date.now(),
  };

  session.lastActivity = activityPayload;

  if (session.desktopWs && session.desktopWs.readyState === WebSocket.OPEN) {
    session.desktopWs.send(JSON.stringify(activityPayload));
  }

  console.log(`[Butterfly Activity] ${activityPayload.appName} (${activityPayload.packageName}) -> Desktop`);

  res.json({ success: true, activity: activityPayload });
});

// 4. Privacy settings endpoints
app.get('/api/privacy/settings', (req, res) => {
  const token = req.query.deviceToken;
  const settings = privacySettings.get(token) || { defaultAction: 'allow', excludedApps: [] };
  res.json({ success: true, settings, knownApps: POPULAR_APP_ICONS });
});

app.post('/api/privacy/settings', (req, res) => {
  const { deviceToken, excludedApps } = req.body;
  if (!deviceToken) return res.status(400).json({ error: 'Missing deviceToken' });

  privacySettings.set(deviceToken, {
    defaultAction: 'allow',
    excludedApps: excludedApps || [],
  });

  res.json({ success: true, message: 'Privacy settings updated' });
});

app.get('/api/status/:pairingId', (req, res) => {
  const session = pairings.get(req.params.pairingId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({
    paired: session.paired,
    mobileConnected: session.mobileConnected,
    lastActivity: session.lastActivity,
  });
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pairingId = url.searchParams.get('pairingId');

  console.log(`[WebSocket] Desktop client connected for session: ${pairingId}`);

  if (pairingId && pairings.has(pairingId)) {
    const session = pairings.get(pairingId);
    session.desktopWs = ws;

    ws.send(JSON.stringify({
      type: 'INIT_STATUS',
      paired: session.paired,
      lastActivity: session.lastActivity,
    }));
  }

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG' }));
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Desktop client disconnected for session: ${pairingId}`);
  });
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`
  🦋 Butterfly Cloud Server running on port ${PORT}
  -------------------------------------------------------------
  - REST API: http://localhost:${PORT}/api
  - WebSocket: ws://localhost:${PORT}/ws
  `);
});
