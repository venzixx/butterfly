# 🦋 Butterfly — Discord Rich Presence for Mobile

**Butterfly** seamlessly syncs your Android phone activity to your Discord profile as a live Rich Presence status using a cloud relay server and a lightweight desktop helper.

```
┌──────────────────┐               ┌──────────────────┐               ┌──────────────────┐
│  📱 Butterfly    │  QR Pairing   │  ☁️ Butterfly    │  WebSocket Push  │ 🦋 Butterfly     │
│     Mobile       │──────────────▶│     Server       │──────────────▶│     Desktop      │
│  - App Privacy   │  (API Key)    │  - Relays status │  (Real-time)     │ - Live Status    │
│  - QR Scanner    │               │  - Stores pairing│                  │ - QR Code        │
│  - Iconify Icons │               │  - User settings │                  │ - Discord RPC    │
└──────────────────┘               └──────────────────┘               └──────────────────┘
```

---

## ✨ Features

- **🦋 Butterfly Desktop Dashboard**: Electron desktop app displaying live connection status (🟢 Connected / 🟡 Waiting for Phone / 🔴 Disconnected), active presence preview, and QR code pairing generator.
- **✨ Iconify Integration**: Beautiful vector icons for 100+ popular phone apps (YouTube, Spotify, Instagram, Netflix, Reddit, Twitch, etc.) and UI indicators.
- **🛡️ Mobile Privacy Controls**: Whitelist/blacklist individual apps (e.g. show YouTube & Spotify, hide WhatsApp & Banking apps with 🔒 badge).
- **🔑 Instant QR & 6-Digit Pairing**: Easy device pairing without passwords.
- **🎮 Official Discord RPC**: Uses official Discord Application ID (`1532431212407164968`) for 100% ToS-compliant local IPC connection to your desktop Discord client.

---

## 📁 Repository Structure

```
butterfly/
├── server/       # Node.js + Express + WebSocket cloud relay server
├── desktop/      # Electron + Iconify + Discord RPC desktop companion app
└── mobile/       # Mobile web dashboard & privacy control center
```

---

## 🚀 Running Locally

### 1. Cloud Server
```bash
cd server
npm install
npm start
```
Server runs on `http://localhost:4000` (REST API) & `ws://localhost:4000/ws` (WebSocket).

### 2. Desktop Companion App
```bash
cd desktop
npm install
npx electron .
```

### 3. Mobile Dashboard / Simulator
Open `mobile/index.html` in your web browser.

---

## ☁️ Free Hosting Guide

### Deploy Cloud Server (Render.com)
1. Create a free account on [Render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository `venzixx/butterfly`.
4. Set Root Directory to `butterfly/server`.
5. Build Command: `npm install`
6. Start Command: `npm start`

### Deploy Mobile Dashboard (Vercel)
1. Go to [Vercel.com](https://vercel.com).
2. Import repository `venzixx/butterfly`.
3. Set Root Directory to `butterfly/mobile`.
4. Deploy!

---

## 📜 License

MIT License © 2026 Butterfly
