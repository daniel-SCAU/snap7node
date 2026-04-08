# Vision Dashboard

A modern real-time vision dashboard built with **Node.js**, **Snap7**, and **Socket.io** for monitoring a Siemens S7-1200 PLC and a Zebra FS42 camera.

## Features

- 📊 **Live PLC metrics** – goodReads, badReads, totalBags, currentBatch, mesBatch (refreshed every second)
- 🔴 **Read result indicators** – animated glow effect for lastReadGood / lastReadBad signals
- 📹 **RTSP camera feed** – live stream from Zebra FS42 via WebSocket + jsmpeg (requires ffmpeg)
- ⚙️ **Settings screen** – configure PLC IP, rack/slot, poll interval, and camera RTSP URL
- 📈 **Read quality bar** – good read % with colour coding
- 📉 **30-second history chart** – trend view of good vs bad reads

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| ffmpeg | any recent version |

Install ffmpeg on Ubuntu/Debian:
```bash
sudo apt-get install ffmpeg
```

## PLC Tags

### Default tag table (Merker area)
| Tag | Address | Type |
|-----|---------|------|
| triggerOffset | %MW12 | Int |
| enableVision | %M14.0 | Bool |
| actualBatchCodeOCR | %MD16 | DInt |
| currentBatch | %MD20 | DInt |
| mesBatch | %MD100 | DInt |

### DB1
| Tag | Offset | Type |
|-----|--------|------|
| goodReads | 406.0 | DInt |
| badReads | 410.0 | DInt |
| totalBags | 414.0 | DInt |
| lastReadGood | 418.0 | Bool |
| lastReadBad | 418.1 | Bool |

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Open in browser
open http://localhost:3000
```

The first time you run, go to **Settings** (⚙ icon top-right) and enter your PLC IP address and camera RTSP URL.
## Default Settings

| Setting | Default |
|---------|---------|
| PLC IP | 192.168.1.10 |
| Rack | 0 |
| Slot | 1 |
| Camera RTSP URL | rtsp://192.168.1.73/LiveStream |
| Poll interval | 1000 ms |

## Architecture

```
server.js          – Express + Socket.io HTTP server
src/plc.js         – node-snap7 wrapper (ReadMultiVars)
src/settings.js    – JSON settings persistence
public/index.html  – Dashboard UI
public/settings.html – Settings UI
public/js/dashboard.js – Real-time dashboard logic
public/js/settings.js  – Settings page logic
public/js/jsmpeg.min.js – MPEG-1 WebSocket player (jsmpeg)
public/css/style.css    – Modern dark-theme CSS
```

## Camera stream notes

The server spawns an `ffmpeg` child process that converts the RTSP feed to MPEG-1 and pipes it over a WebSocket connection to the browser where jsmpeg renders it on a canvas element.

If ffmpeg is not installed the camera panel will show an offline state; all PLC data will still work normally.
