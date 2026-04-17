# Vision Dashboard

A modern real-time vision dashboard built with **Node.js**, **Snap7**, and **Socket.io** for monitoring a Siemens S7-1200 PLC and a Zebra FS42 camera.

## Features

- 📊 **Live PLC metrics** – goodReads, badReads, totalBags, currentBatch, mesBatch, and actualBatchCodeOCR (refreshed every second via Socket.io)
- 🔴 **Read result indicators** – animated glow effect for lastReadGood / lastReadBad signals with toast notifications on state change
- 📹 **Camera feed** – live view from Zebra FS42 embedded via an `<iframe>` pointing to the camera's HTTP interface
- ⚙️ **Settings screen** – configure PLC IP, rack/slot, poll interval, camera IP, and camera URL
- 🔘 **System Enable toggle** – read and write the vision system enable bit (M14.0) directly from the Settings page
- 📦 **New Batch keypad** – virtual numeric keypad modal for writing a new MES Batch number to MD100
- 📈 **Read quality bar** – good read % with colour coding (blue/cyan above 80 %, red/yellow below)
- 📉 **30-point history chart** – trend view of good vs bad reads (Chart.js)
- 🔔 **Toast notifications** – real-time alerts for PLC connection changes and read result events

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |

## PLC Tags

### Merker area
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

# Start with auto-reload (development)
npm run dev

# Open in browser
open http://localhost:3000
```

The first time you run, go to **Settings** (⚙ icon top-right) and enter your PLC IP address and camera URL.

## Default Settings

| Setting | Default |
|---------|---------|
| PLC IP | 192.168.1.10 |
| Rack | 0 |
| Slot | 1 |
| Camera IP | 192.168.1.73 |
| Camera URL | http://192.168.1.73/ |
| Poll interval | 1000 ms |

Settings are persisted to `settings.json` in the project root and merged with the defaults on startup.

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/settings` | Return current settings |
| `POST` | `/api/settings` | Save settings and reconnect PLC |
| `GET` | `/api/plc/system-enable` | Read the System Enable bit (M14.0) |
| `POST` | `/api/plc/system-enable` | Write the System Enable bit – body `{ "value": true \| false }` |
| `POST` | `/api/plc/mes-batch` | Write MES Batch (MD100) – body `{ "value": <integer> }` |

## Architecture

```
server.js               – Express + Socket.io HTTP server, PLC polling loop,
                          REST API endpoints
src/plc.js              – node-snap7 wrapper (ReadMultiVars, WriteArea)
src/settings.js         – JSON settings persistence (settings.json)
public/index.html       – Dashboard UI
public/settings.html    – Settings UI
public/js/dashboard.js  – Real-time dashboard logic (Socket.io, Chart.js, keypad)
public/js/settings.js   – Settings page logic (load, save, system-enable toggle)
public/css/style.css    – Modern dark-theme CSS
```

## Camera notes

The dashboard embeds the camera's web interface in an `<iframe>`. Set the **Camera URL** in Settings to the HTTP address of the Zebra FS42 (e.g. `http://192.168.1.73/`). No additional software is required.
