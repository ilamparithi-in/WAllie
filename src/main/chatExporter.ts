import { app, BrowserWindow, dialog, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { state } from './state';
import { getInitialWindowSize, getAppIcon, getPreloadPath } from './utils';
import type {
  WhatsAppChatExport,
  ChatExportOptions,
  MultiChatExportRequest,
  ChatExportProgress,
  ChatExportResult,
} from '../shared/chatExportTypes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ChatExporterManager {
  private activeJobs = new Map<
    string,
    {
      exportId: string;
      options: ChatExportOptions;
      isAborted: boolean;
      progress: ChatExportProgress;
    }
  >();
  private viewerWindows = new Map<number, BrowserWindow>();

  /**
   * Cleans filename strings for safe cross-platform filesystem use.
   */
  public sanitizeFilename(name: string): string {
    return (name || 'WhatsApp-Chat')
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
      .trim()
      .slice(0, 100);
  }

  /**
   * Prompts user for a directory where export files will be written.
   */
  public async promptExportDirectory(defaultName?: string): Promise<string | null> {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Select Destination Folder for Chat Export',
      defaultPath: defaultName ? path.join(app.getPath('downloads'), defaultName) : app.getPath('downloads'),
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  }

  /**
   * Prompts user to select an existing .json or .html chat export file to view.
   */
  public async promptOpenExportFile(): Promise<string | null> {
    if (!state.mainWindow) return null;
    const result = await dialog.showOpenDialog(state.mainWindow, {
      title: 'Open Exported WhatsApp Chat',
      defaultPath: app.getPath('downloads'),
      filters: [
        { name: 'WhatsApp Chat Export', extensions: ['json', 'html'] },
        { name: 'JSON Export File', extensions: ['json'] },
        { name: 'HTML Viewer File', extensions: ['html'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  }

  /**
   * Initializes folder structure for an export:
   *   <outputDirectory>/<safeChatName>_files/media/
   *   <outputDirectory>/<safeChatName>_files/avatars/
   */
  public prepareExportPaths(outputDirectory: string, chatTitle: string) {
    const safeTitle = this.sanitizeFilename(chatTitle);
    const filesDirName = `${safeTitle}_files`;
    const filesDirPath = path.join(outputDirectory, filesDirName);
    const mediaDirPath = path.join(filesDirPath, 'media');
    const avatarsDirPath = path.join(filesDirPath, 'avatars');
    const jsonPath = path.join(outputDirectory, `${safeTitle}.json`);
    const htmlPath = path.join(outputDirectory, `${safeTitle}.html`);

    fs.mkdirSync(mediaDirPath, { recursive: true });
    fs.mkdirSync(avatarsDirPath, { recursive: true });

    return {
      safeTitle,
      filesDirName,
      filesDirPath,
      mediaDirPath,
      avatarsDirPath,
      jsonPath,
      htmlPath,
    };
  }

  /**
   * Saves a binary media file or avatar image into the companion directory.
   */
  public async saveMediaFile(
    outputDirectory: string,
    filesDirName: string,
    subPath: string, // e.g. "media/3EB0XX.jpeg" or "avatars/123@lid.jpg"
    data: Buffer | ArrayBuffer | string // binary buffer or base64 data url
  ): Promise<string> {
    const fullPath = path.join(outputDirectory, filesDirName, subPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    if (typeof data === 'string') {
      // Data URI conversion
      const matches = data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches[2]) {
        const buffer = Buffer.from(matches[2], 'base64');
        await fs.promises.writeFile(fullPath, buffer);
      } else {
        await fs.promises.writeFile(fullPath, data, 'utf8');
      }
    } else if (data instanceof ArrayBuffer) {
      await fs.promises.writeFile(fullPath, Buffer.from(data));
    } else {
      await fs.promises.writeFile(fullPath, data);
    }

    return `${filesDirName}/${subPath}`;
  }

  /**
   * Finalizes and saves the complete JSON export envelope.
   * If includeViewer is true, generates and saves the companion .html viewer file.
   */
  public async finalizeExport(
    outputDirectory: string,
    exportData: WhatsAppChatExport,
    includeViewer: boolean = true
  ): Promise<{ jsonPath: string; htmlPath?: string }> {
    const paths = this.prepareExportPaths(outputDirectory, exportData.chat.name);

    // 1. Write the structured JSON file
    const jsonContent = JSON.stringify(exportData, null, 2);
    await fs.promises.writeFile(paths.jsonPath, jsonContent, 'utf8');

    // 2. Generate and write the offline HTML viewer if enabled
    let htmlPath: string | undefined;
    if (includeViewer) {
      const viewerHtml = this.generateStandaloneViewerHtml(exportData, paths.safeTitle);
      await fs.promises.writeFile(paths.htmlPath, viewerHtml, 'utf8');
      htmlPath = paths.htmlPath;
    }

    return {
      jsonPath: paths.jsonPath,
      htmlPath,
    };
  }

  /**
   * Starts tracking an export job.
   */
  public registerJob(exportId: string, options: ChatExportOptions, totalChats: number = 1, currentChatIndex: number = 0): void {
    const progress: ChatExportProgress = {
      exportId,
      accountId: options.accountId,
      chatJid: options.chatJid,
      chatTitle: options.chatTitle || 'WhatsApp Chat',
      currentChatIndex,
      totalChatsCount: totalChats,
      messagesExported: 0,
      mediaFilesSaved: 0,
      oldestMessageDate: null,
      status: 'starting',
    };

    this.activeJobs.set(exportId, {
      exportId,
      options,
      isAborted: false,
      progress,
    });

    this.notifyProgress(progress);
  }

  /**
   * Updates progress for an ongoing export job.
   */
  public updateProgress(exportId: string, partial: Partial<ChatExportProgress>): void {
    const job = this.activeJobs.get(exportId);
    if (!job) return;

    job.progress = {
      ...job.progress,
      ...partial,
    };

    this.notifyProgress(job.progress);
  }

  /**
   * Checks if an export has been aborted by the user.
   */
  public isExportAborted(exportId: string): boolean {
    const job = this.activeJobs.get(exportId);
    return job ? job.isAborted : false;
  }

  /**
   * Signals an active export to stop immediately.
   */
  public stopExport(exportId?: string): boolean {
    if (exportId) {
      const job = this.activeJobs.get(exportId);
      if (job) {
        job.isAborted = true;
        job.progress.status = 'aborted';
        this.notifyProgress(job.progress);
        return true;
      }
      return false;
    }

    // Stop all active export jobs if no specific ID is provided
    let stoppedAny = false;
    for (const job of this.activeJobs.values()) {
      job.isAborted = true;
      job.progress.status = 'aborted';
      this.notifyProgress(job.progress);
      stoppedAny = true;
    }
    return stoppedAny;
  }

  /**
   * Removes an export job upon completion or termination.
   */
  public completeJob(exportId: string): void {
    this.activeJobs.delete(exportId);
    // Notify renderer that export has concluded so titlebar clears "Stop Export"
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('chat-export:ended', exportId);
    }
  }

  /**
   * Sends real-time progress events to the main WAllie window for titlebar and modal updates.
   */
  private notifyProgress(progress: ChatExportProgress): void {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('chat-export:progress', progress);
    }
  }

  /**
   * Launches the built-in standalone viewer in a dedicated BrowserWindow.
   */
  public async openExportViewerWindow(filePath: string): Promise<void> {
    const { width, height } = getInitialWindowSize(1200, 850, state.mainWindow);

    const viewerWin = new BrowserWindow({
      width,
      height,
      minWidth: 480,
      minHeight: 500,
      title: `WAllie Chat Viewer — ${path.basename(filePath)}`,
      icon: getAppIcon(),
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    viewerWin.removeMenu();
    this.viewerWindows.set(viewerWin.id, viewerWin);

    viewerWin.on('closed', () => {
      this.viewerWindows.delete(viewerWin.id);
    });

    if (filePath.endsWith('.html')) {
      await viewerWin.loadFile(filePath);
    } else if (filePath.endsWith('.json')) {
      // If a JSON file is selected directly, check if companion HTML exists alongside it
      const htmlPath = filePath.replace(/\.json$/i, '.html');
      if (fs.existsSync(htmlPath)) {
        await viewerWin.loadFile(htmlPath);
      } else {
        // Read JSON and generate a temporary viewer
        try {
          const raw = fs.readFileSync(filePath, 'utf8');
          const exportData = JSON.parse(raw) as WhatsAppChatExport;
          const htmlContent = this.generateStandaloneViewerHtml(exportData, exportData.chat?.name || 'WhatsApp Chat');
          const tempHtmlPath = path.join(app.getPath('temp'), `wallie-viewer-${Date.now()}.html`);
          fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');
          await viewerWin.loadFile(tempHtmlPath);
        } catch (err) {
          console.error('Failed to parse chat export JSON:', err);
          dialog.showErrorBox('Viewer Error', `Unable to load export file:\n${(err as Error).message}`);
          viewerWin.close();
        }
      }
    }
  }

  /**
   * Generates a complete, single-file HTML/CSS/JS offline viewer with authentic WhatsApp Web styling.
   */
  public generateStandaloneViewerHtml(exportData: WhatsAppChatExport, chatTitle: string): string {
    const rawDataJson = JSON.stringify(exportData).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');

    return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>WhatsApp Chat — ${this.escapeHtml(chatTitle)}</title>
  <style>
    :root {
      --bg-app: #111b21;
      --bg-panel: #202c33;
      --bg-header: #202c33;
      --bubble-in: #202c33;
      --bubble-out: #005c4b;
      --text-primary: #e9edef;
      --text-secondary: #8696a0;
      --text-meta: #8696a0;
      --text-meta-out: #8696a0;
      --accent: #00a884;
      --accent-rgb: 0, 168, 132;
      --border-subtle: #222d34;
      --system-pill-bg: #182229;
      --date-pill-bg: #182229;
      --reply-border: #00a884;
      --reply-bg: rgba(0, 0, 0, 0.2);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg-app);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      user-select: text;
    }
    header {
      background-color: var(--bg-header);
      padding: 10px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid var(--border-subtle);
      flex-shrink: 0;
      z-index: 10;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background-color: #374248;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      color: #e9edef;
      overflow: hidden;
      flex-shrink: 0;
    }
    .avatar img { width: 100%; height: 100%; object-fit: cover; }
    .header-info { flex-grow: 1; min-width: 0; }
    .header-title { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .header-sub { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
    .search-box {
      background-color: #111b21;
      border: 1px solid var(--border-subtle);
      border-radius: 8px;
      padding: 6px 12px;
      color: var(--text-primary);
      font-size: 13px;
      outline: none;
      width: 200px;
    }
    .search-box:focus { border-color: var(--accent); }
    .timeline-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px 24px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      background-image: radial-gradient(circle at center, rgba(17, 27, 33, 0.98), rgba(11, 20, 26, 0.99));
    }
    .date-divider {
      align-self: center;
      background-color: var(--date-pill-bg);
      color: var(--text-secondary);
      font-size: 12px;
      padding: 5px 12px;
      border-radius: 8px;
      margin: 12px 0 8px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .system-banner {
      align-self: center;
      background-color: var(--system-pill-bg);
      color: #f1b343;
      font-size: 12px;
      padding: 6px 14px;
      border-radius: 8px;
      margin: 8px 0;
      text-align: center;
      max-width: 85%;
      box-shadow: 0 1px 2px rgba(0,0,0,0.25);
      line-height: 1.4;
    }
    .msg-row {
      display: flex;
      width: 100%;
      margin-bottom: 2px;
    }
    .msg-row.out { justify-content: flex-end; }
    .msg-row.in { justify-content: flex-start; }
    .bubble {
      max-width: 65%;
      min-width: 100px;
      padding: 6px 9px 8px;
      border-radius: 8px;
      font-size: 14.2px;
      line-height: 19px;
      position: relative;
      box-shadow: 0 1px 0.5px rgba(0,0,0,0.13);
      word-wrap: break-word;
    }
    .msg-row.out .bubble { background-color: var(--bubble-out); border-top-right-radius: 0; }
    .msg-row.in .bubble { background-color: var(--bubble-in); border-top-left-radius: 0; }
    .author-name {
      font-size: 12.8px;
      font-weight: 500;
      margin-bottom: 3px;
      display: flex;
      flex-direction: column;
    }
    .member-label {
      font-size: 11px;
      color: var(--text-secondary);
      font-weight: normal;
      margin-top: 1px;
    }
    .quoted-box {
      background-color: var(--reply-bg);
      border-left: 4px solid var(--reply-border);
      border-radius: 4px;
      padding: 4px 8px;
      margin-bottom: 5px;
      font-size: 12.5px;
      cursor: pointer;
    }
    .quoted-box .q-sender { font-weight: 600; color: var(--accent); margin-bottom: 2px; }
    .quoted-box .q-text { color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .forwarded-badge {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      font-style: italic;
      color: var(--text-secondary);
      margin-bottom: 4px;
    }
    .meta-time {
      float: right;
      margin-left: 10px;
      margin-top: 4px;
      font-size: 11px;
      color: var(--text-meta);
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .media-card {
      margin-bottom: 4px;
      border-radius: 6px;
      overflow: hidden;
      cursor: pointer;
    }
    .media-card img, .media-card video {
      display: block;
      max-width: 100%;
      max-height: 400px;
      border-radius: 6px;
    }
    .audio-player {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
    }
    .audio-player audio { width: 240px; height: 32px; }
    .call-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 4px 0;
    }
    .call-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background-color: rgba(234, 67, 53, 0.2);
      color: #ea4335;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .reaction-pill {
      position: absolute;
      bottom: -8px;
      right: 8px;
      background-color: #202c33;
      border: 1px solid var(--border-subtle);
      border-radius: 12px;
      padding: 1px 6px;
      font-size: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    }
    .highlight-flash {
      animation: highlightPulse 1.5s ease-out;
    }
    @keyframes highlightPulse {
      0% { box-shadow: 0 0 0 4px #00a884; }
      100% { box-shadow: 0 1px 0.5px rgba(0,0,0,0.13); }
    }
  </style>
</head>
<body>
  <header>
    <div class="avatar" id="chatAvatar"></div>
    <div class="header-info">
      <div class="header-title" id="chatTitle">WhatsApp Chat</div>
      <div class="header-sub" id="chatSubtitle">Exported with WAllie</div>
    </div>
    <input type="text" class="search-box" id="searchBox" placeholder="Search in chat..." />
  </header>

  <div class="timeline-container" id="timeline"></div>

  <script>
    const exportData = ${rawDataJson};

    document.addEventListener("DOMContentLoaded", () => {
      const chatTitleEl = document.getElementById("chatTitle");
      const chatSubEl = document.getElementById("chatSubtitle");
      const chatAvatarEl = document.getElementById("chatAvatar");
      const timelineEl = document.getElementById("timeline");
      const searchBox = document.getElementById("searchBox");

      if (exportData.chat) {
        chatTitleEl.textContent = exportData.chat.name || "WhatsApp Chat";
        const total = exportData.exportRange?.totalMessagesCount || exportData.timeline?.length || 0;
        chatSubEl.textContent = \`\${total} messages • \${exportData.chat.type || "chat"}\`;
        if (exportData.chat.avatarUrl) {
          chatAvatarEl.innerHTML = \`<img src="\${exportData.chat.avatarUrl}" alt="Avatar" />\`;
        } else {
          chatAvatarEl.textContent = (exportData.chat.name || "W")[0].toUpperCase();
        }
      }

      function renderTimeline(filterText = "") {
        timelineEl.innerHTML = "";
        const query = filterText.toLowerCase().trim();

        if (!exportData.timeline || !exportData.timeline.length) {
          timelineEl.innerHTML = '<div class="date-divider">No messages found in export</div>';
          return;
        }

        exportData.timeline.forEach((item) => {
          if (item.type === "date_divider") {
            const div = document.createElement("div");
            div.className = "date-divider";
            div.textContent = item.displayText || item.date;
            timelineEl.appendChild(div);
            return;
          }

          if (item.type === "system_event") {
            const div = document.createElement("div");
            div.className = "system-banner";
            div.textContent = item.text;
            timelineEl.appendChild(div);
            return;
          }

          if (item.type === "message") {
            // Text search filter
            if (query) {
              const body = (item.content?.body || item.content?.caption || item.content?.fileName || "").toLowerCase();
              const author = (item.sender?.displayName || "").toLowerCase();
              if (!body.includes(query) && !author.includes(query)) {
                return;
              }
            }

            const row = document.createElement("div");
            row.className = \`msg-row \${item.direction === "outgoing" ? "out" : "in"}\`;
            row.id = \`msg-\${item.id}\`;

            const bubble = document.createElement("div");
            bubble.className = "bubble";

            // Author Header (for incoming messages in groups)
            if (item.direction === "incoming" && item.sender?.displayName) {
              const authorEl = document.createElement("div");
              authorEl.className = "author-name";
              authorEl.style.color = getAuthorColor(item.sender.colorIndex || 1);
              authorEl.textContent = item.sender.displayName;

              if (item.sender.memberLabel) {
                const labelEl = document.createElement("span");
                labelEl.className = "member-label";
                labelEl.textContent = item.sender.memberLabel;
                authorEl.appendChild(labelEl);
              }
              bubble.appendChild(authorEl);
            }

            // Forwarded badge
            if (item.flags?.isForwarded || item.flags?.isForwardedManyTimes) {
              const fwd = document.createElement("div");
              fwd.className = "forwarded-badge";
              fwd.innerHTML = \`<span>\${item.flags.isForwardedManyTimes ? "⏩ Forwarded many times" : "↪ Forwarded"}</span>\`;
              bubble.appendChild(fwd);
            }

            // Quoted Reply Context
            if (item.replyContext) {
              const qBox = document.createElement("div");
              qBox.className = "quoted-box";
              qBox.onclick = () => {
                if (item.replyContext.id) {
                  const targetEl = document.getElementById(\`msg-\${item.replyContext.id}\`);
                  if (targetEl) {
                    targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
                    targetEl.querySelector(".bubble")?.classList.add("highlight-flash");
                    setTimeout(() => {
                      targetEl.querySelector(".bubble")?.classList.remove("highlight-flash");
                    }, 1600);
                  }
                }
              };
              qBox.innerHTML = \`
                <div class="q-sender">\${escapeHtml(item.replyContext.sender?.displayName || "Reply")}</div>
                <div class="q-text">\${escapeHtml(item.replyContext.textSnippet || "Media")}</div>
              \`;
              bubble.appendChild(qBox);
            }

            // Content variants
            const content = item.content || { type: "text", body: "" };

            if (content.type === "text") {
              const textSpan = document.createElement("span");
              textSpan.innerHTML = formatBodyText(content.body || "");
              bubble.appendChild(textSpan);
            } else if (content.type === "image") {
              const card = document.createElement("div");
              card.className = "media-card";
              const mediaSrc = content.mediaRef || content.thumbnailDataUri;
              card.innerHTML = \`<img src="\${mediaSrc}" alt="Photo" />\`;
              bubble.appendChild(card);
              if (content.caption) {
                const cap = document.createElement("div");
                cap.style.marginTop = "4px";
                cap.innerHTML = formatBodyText(content.caption);
                bubble.appendChild(cap);
              }
            } else if (content.type === "video") {
              const card = document.createElement("div");
              card.className = "media-card";
              card.innerHTML = \`<video src="\${content.mediaRef}" controls poster="\${content.thumbnailDataUri || ''}"></video>\`;
              bubble.appendChild(card);
              if (content.caption) {
                const cap = document.createElement("div");
                cap.style.marginTop = "4px";
                cap.innerHTML = formatBodyText(content.caption);
                bubble.appendChild(cap);
              }
            } else if (content.type === "audio") {
              const audioDiv = document.createElement("div");
              audioDiv.className = "audio-player";
              audioDiv.innerHTML = \`<audio src="\${content.mediaRef}" controls></audio>\`;
              bubble.appendChild(audioDiv);
            } else if (content.type === "call_log") {
              const callDiv = document.createElement("div");
              callDiv.className = "call-card";
              const title = content.callDurationSeconds ? "Voice call" : "Missed call";
              callDiv.innerHTML = \`
                <div class="call-icon">📞</div>
                <div>
                  <div style="font-weight:600">\${title}</div>
                  <div style="font-size:11px; color:var(--text-secondary)">\${content.callDurationSeconds ? content.callDurationSeconds + 's' : 'No answer'}</div>
                </div>
              \`;
              bubble.appendChild(callDiv);
            } else {
              const fallback = document.createElement("span");
              fallback.textContent = content.body || content.fallbackText || "[Attachment]";
              bubble.appendChild(fallback);
            }

            // Timestamp and read tick
            const meta = document.createElement("span");
            meta.className = "meta-time";
            const timeStr = item.displayTime || (item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "");
            meta.innerHTML = \`<span>\${timeStr}</span>\`;
            bubble.appendChild(meta);

            // Reactions pill
            if (item.reactions && item.reactions.length > 0) {
              const pill = document.createElement("div");
              pill.className = "reaction-pill";
              pill.textContent = item.reactions.map(r => r.emoji).join(" ");
              bubble.appendChild(pill);
            }

            row.appendChild(bubble);
            timelineEl.appendChild(row);
          }
        });
      }

      searchBox.addEventListener("input", (e) => {
        renderTimeline(e.target.value);
      });

      renderTimeline();
    });

    function escapeHtml(str) {
      return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function formatBodyText(body) {
      let safe = escapeHtml(body);
      safe = safe.replace(/\\n/g, "<br>");
      // Simple bold and italic
      safe = safe.replace(/\\*([^\\*]+)\\*/g, "<strong>$1</strong>");
      safe = safe.replace(/_([^_]+)_/g, "<em>$1</em>");
      return safe;
    }

    function getAuthorColor(index) {
      const colors = ["#00a884", "#25d366", "#34b7f1", "#e542a3", "#a62c2b", "#d36500", "#7f66ff", "#029046"];
      return colors[(index || 0) % colors.length];
    }
  </script>
</body>
</html>`;
  }

  private escapeHtml(str: string): string {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const chatExporterManager = new ChatExporterManager();

