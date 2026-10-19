# WAllie Dev Bridge: Agent & Debugger Reference

> [!CAUTION]
> ### 🚨 CRITICAL SECURITY WARNING: HIGH-RISK INSECURE BUILD
> **Enabling the Dev Bridge compiles a local HTTP control server directly into WAllie that exposes the active WhatsApp Web session to complete inspection and remote manipulation.**
>
> - **⚠️ NEVER DISTRIBUTE OR RELEASE** any binary, `.deb`, `.pacman`, or AppImage package built with `ENABLE_DEV_BRIDGE=true`.
> - **⚠️ NEVER USE THIS BUILD AS A DAILY DRIVER** for personal or confidential communication.
> - **⚠️ FULL DOM & CODE EXECUTION EXPOSURE:** Any process with access to loopback (`127.0.0.1`) and the ephemeral token file (`/tmp/wallie-dev-bridge.json`) can read all private messages, active chats, contacts, network traffic, cookies, and execute arbitrary JavaScript code via the `/eval` and `/cdp` endpoints.
> - **⚠️ STRICTLY FOR LOCAL DEBUGGING:** This feature is strictly intended for isolated local debugging between the developer and an AI assistant on a trusted, single-user workstation.

The **WAllie Dev Bridge** is a private, internal HTTP loopback service embedded in the Electron main process of [WAllie](https://github.com/ilamparithi-in/WAllie). It allows an AI agent or local developer to inspect the live WhatsApp Web DOM, evaluate JavaScript expressions, inspect Console logs, track Network requests, capture screenshots, and issue raw Chrome DevTools Protocol (CDP) commands in real time.

---

## 1. Quick Start

### Starting WAllie with the Bridge Enabled
The bridge is **build-time gated** and **disabled by default in production builds**. To launch WAllie with the bridge compiled in and running:

```bash
npm run dev:bridge
```

### Checking if the Bridge is Running
Once WAllie boots up, verify the connection instantly using the helper CLI:

```bash
node scripts/wa-bridge.mjs status
```

---

## 2. Authentication & Security Architecture

1. **Loopback Only:** The HTTP server listens strictly on `127.0.0.1:3888` (rejects non-loopback remote addresses with `403 Forbidden`).
2. **Ephemeral Token Authority:** Every time WAllie launches with the bridge enabled, the main process generates a random UUID (`crypto.randomUUID()`) and writes a lockfile with strict file permissions (`0600`):
   - **Lockfile Path:** `/tmp/wallie-dev-bridge.json`
   - **Lockfile Content:**
     ```json
     {
       "pid": 128979,
       "port": 3888,
       "token": "7f3ebac1-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
       "startedAt": "2026-10-18T02:09:47.000Z"
     }
     ```
3. **Required Headers:** All HTTP requests must include either:
   - `x-bridge-token: <TOKEN>`
   - `Authorization: Bearer <TOKEN>`
4. **Automatic Cleanup:** When WAllie quits (`before-quit`, `SIGINT`, `SIGTERM`), the HTTP server shuts down and the lockfile `/tmp/wallie-dev-bridge.json` is automatically deleted.

---

## 3. Using the CLI Helper (`scripts/wa-bridge.mjs`)

The fastest way for an AI agent or developer to query the bridge is via the CLI script, which automatically reads the active token from `/tmp/wallie-dev-bridge.json`:

### Check Status & Active View
```bash
node scripts/wa-bridge.mjs status
```

### Read Console Logs (DevTools Console)
```bash
# Get recent console messages
node scripts/wa-bridge.mjs console

# Filter for errors only or search by keyword
node scripts/wa-bridge.mjs console --level error
node scripts/wa-bridge.mjs console --search "WebSocket" --limit 20

# Clear the console buffer
node scripts/wa-bridge.mjs console --clear
```

### Monitor Network Requests (DevTools Network Tab)
```bash
# Get recent network requests
node scripts/wa-bridge.mjs network

# Filter for failed requests only (HTTP 4xx/5xx or network errors)
node scripts/wa-bridge.mjs network --failed

# Filter by resource type (xhr, fetch, websocket, script, image)
node scripts/wa-bridge.mjs network --type xhr
node scripts/wa-bridge.mjs network --type websocket
```

### Execute Chrome DevTools Protocol (CDP) Commands
```bash
# Call any Chromium DevTools command directly
node scripts/wa-bridge.mjs cdp Page.getLayoutMetrics
node scripts/wa-bridge.mjs cdp Network.getCookies '{"urls": ["https://web.whatsapp.com"]}'
node scripts/wa-bridge.mjs cdp DOM.getDocument '{"depth": 2}'
```

### Query DOM Elements by CSS Selector
```bash
# Query elements matching selector (returns tag, id, class, testId, role, text, attributes)
node scripts/wa-bridge.mjs query '[data-testid="chat-list"] [role="listitem"]'

# Limit results and include outer HTML snippet
node scripts/wa-bridge.mjs query 'header [data-testid="conversation-info-header"]' --limit 5 --html
```

### Evaluate Arbitrary JavaScript
```bash
# Run JS directly in the WhatsApp Web page context
node scripts/wa-bridge.mjs eval 'document.title'
node scripts/wa-bridge.mjs eval 'document.querySelectorAll("[data-testid=\"msg-container\"]").length'
```

### Dump DOM Subtree (with Sanitization)
```bash
# Dump #main (active chat area) or full document ('html')
node scripts/wa-bridge.mjs dom '#main' --chars 100000
```
> **Note:** Base64 image data URIs and massive SVG path coordinates are automatically stripped/compacted by default to avoid blowing token context limits.

### Capture a Screenshot
```bash
# Saves capture to app user data or specified path
node scripts/wa-bridge.mjs screenshot /tmp/wa-current.png
```

### Switch Active Account
```bash
node scripts/wa-bridge.mjs switch acc_default
```

---

## 4. Direct REST API Specification

If you prefer calling the HTTP server directly (e.g. via `curl`, Python, or `fetch`):

**Base URL:** `http://127.0.0.1:3888`  
**Headers:** `Content-Type: application/json`, `x-bridge-token: <TOKEN>`

---

### `GET /status` (or `GET /health`)
Returns bridge telemetry, configured accounts, and the active WhatsApp view state.

---

### `GET /console` or `POST /console`
Returns recent console messages captured from all WebContents and guest views.

**Request Body (Optional):**
```json
{
  "level": "error",          // "verbose" | "info" | "warning" | "error"
  "search": "TypeError",     // Case-insensitive substring match
  "limit": 50,               // Default 100, max 500
  "clear": false,            // If true, flushes the log buffer
  "accountId": "acc_default" // Filter by specific account
}
```

**Response Example:**
```json
{
  "total": 12,
  "returned": 1,
  "logs": [
    {
      "accountId": "acc_default",
      "url": "https://web.whatsapp.com/",
      "level": "error",
      "levelName": "error",
      "message": "Uncaught (in promise) Error: WebSocket closed",
      "line": 42,
      "source": "https://web.whatsapp.com/app.js",
      "timestamp": 1729215000000
    }
  ]
}
```

---

### `GET /network` or `POST /network`
Returns recent HTTP/HTTPS and WebSocket network traffic intercepted via the Electron session.

**Request Body (Optional):**
```json
{
  "resourceType": "xhr",     // "xhr" | "fetch" | "websocket" | "script" | "image"
  "search": "whatsapp.net",  // Substring match on URL
  "failedOnly": true,        // Filter for HTTP >= 400 or network errors
  "limit": 100,              // Default 100, max 500
  "clear": false
}
```

**Response Example:**
```json
{
  "total": 45,
  "returned": 1,
  "requests": [
    {
      "id": 1024,
      "partition": "persist:account_default",
      "url": "https://web.whatsapp.com/ws/chat",
      "method": "GET",
      "statusCode": 101,
      "statusLine": "HTTP/1.1 101 Switching Protocols",
      "resourceType": "websocket",
      "durationMs": 142,
      "timestamp": 1729215000000
    }
  ]
}
```

---

### `POST /cdp`
Directly dispatches Chromium DevTools Protocol (CDP) commands to the active WhatsApp Web frame.

**Request Body:**
```json
{
  "method": "Page.captureScreenshot",
  "params": {
    "format": "png"
  },
  "accountId": "acc_default"
}
```

**Response Example:**
```json
{
  "success": true,
  "method": "Page.captureScreenshot",
  "result": {
    "data": "iVBORw0KGgoAAAANSUhEUgAA..."
  }
}
```

---

### `POST /query`
Performs `document.querySelectorAll()` inside the active WhatsApp Web view and serializes element properties.

**Request Body:**
```json
{
  "selector": "[data-testid=\"chat-list\"] [role=\"listitem\"]",
  "limit": 20,
  "includeHtml": false,
  "attributes": true,
  "accountId": "acc_default" 
}
```

---

### `POST /eval`
Runs an arbitrary JavaScript snippet or promise in the WhatsApp Web frame context using Electron's `webContents.executeJavaScript()`.

**Request Body:**
```json
{
  "code": "document.querySelector('footer [contenteditable=\"true\"]').innerText",
  "accountId": "acc_default"
}
```

---

### `POST /dom`
Dumps the HTML of a selector or the entire document (with base64 and SVG stripping).

**Request Body:**
```json
{
  "selector": "html",
  "stripBlobs": true,
  "maxChars": 500000,
  "accountId": "acc_default"
}
```

---

### `POST /screenshot`
Captures the active view using `webContents.capturePage()`.

**Request Body:**
```json
{
  "savePath": "/tmp/wa-current.png",
  "returnBase64": false,
  "accountId": "acc_default"
}
```

---

### `POST /accounts/switch`
Switches the actively displayed WhatsApp account tab.

**Request Body:**
```json
{
  "accountId": "acc_1785179322816"
}
```

---

## 5. WhatsApp Web DOM Selectors Cheatsheet

For quick agent navigation, these are standard selectors used by WhatsApp Web:

| Component | Selector | Notes |
| :--- | :--- | :--- |
| **Chat List Pane** | `[data-testid="chat-list"]` | Left-hand sidebar containing active chats |
| **Chat List Items** | `[data-testid="chat-list"] [role="listitem"]` | Individual chat rows |
| **Unread Badge** | `span[data-testid="icon-unread-count"]` | Displays number of unread messages |
| **Active Chat Header** | `header [data-testid="conversation-info-header"]` | Current contact / group name and status |
| **Message Bubble Container** | `div[data-testid="msg-container"]` | Individual chat messages |
| **Incoming Message** | `.message-in` | Inbound message bubble |
| **Outgoing Message** | `.message-out` | Outbound message bubble |
| **Message Text** | `span.selectable-text` | Message body content |
| **Input Composer Box** | `footer div[contenteditable="true"]` | Primary message typing area |
| **Send Button** | `button[data-testid="send"]` or `span[data-icon="send"]` | Send message action button |
| **Search Input** | `div[data-testid="chat-list-search"]` | Search contacts/messages bar |
| **Main Chat Area** | `#main` | Active conversation panel container |

---

## 6. Agent Best Practices

1. **Verify Bridge State First:** Always run `node scripts/wa-bridge.mjs status` before attempting DOM interactions to confirm the target view is loaded (`isLoading: false`) and check `activeAccountId`.
2. **Diagnosing Page Issues with `/console`:** If an action fails or elements don't appear, check `node scripts/wa-bridge.mjs console --level error` to see what WhatsApp's frontend threw.
3. **Checking Stalled Sync with `/network`:** If chats aren't updating, inspect `node scripts/wa-bridge.mjs network --type websocket` to verify the connection is alive.
4. **Favor `/query` Over Full `/dom`:** WhatsApp Web's DOM is large (often 5MB–20MB+). Use targeted `query` requests with specific `data-testid` or CSS selectors rather than dumping the whole DOM into your context window.
5. **Use Sanitization (`stripBlobs: true`):** When dumping DOM subtrees via `/dom`, keep `stripBlobs: true` so binary images and long SVG path definitions don't consume unnecessary context.
6. **Visual Layout Checks:** When in doubt about styling or rendered UI states, call `screenshot` and inspect the captured PNG artifact.
