/**
 * Floating Progress HUD and Completion Modal for the chat exporter.
 */

let lastKnownOldestDate: string = '';
let isCurrentJobAborted: boolean = false;

export function getIsCurrentJobAborted(): boolean {
  return isCurrentJobAborted;
}

export function setIsCurrentJobAborted(val: boolean): void {
  isCurrentJobAborted = val;
}

export function getLastKnownOldestDate(): string {
  return lastKnownOldestDate;
}

export function setLastKnownOldestDate(val: string): void {
  lastKnownOldestDate = val;
}

/**
 * Renders or updates the floating in-viewport progress HUD inside the WhatsApp DOM.
 */
export function showOrUpdateExportHUD(state: {
  title: string;
  index: number;
  total: number;
  statusText: string;
  msgCount: number;
  mediaCount: number;
  totalMedia?: number;
  skippedCount?: number;
  oldestDate?: string;
  exportId: string;
  canSkip?: boolean;
  onSkip?: () => void;
  skipLabel?: string;
}): void {
  if (state.oldestDate) {
    lastKnownOldestDate = state.oldestDate;
  }

  let overlay = document.getElementById('wallie-export-hud-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'wallie-export-hud-overlay';
    overlay.setAttribute(
      'style',
      'position: fixed; inset: 0; z-index: 2147483640; pointer-events: none; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edef; user-select: none;'
    );
    overlay.innerHTML = `
    <style>
      #wallie-export-hud-overlay,
      #wallie-export-hud-overlay *,
      #wallie-export-card button {
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
      }
      @keyframes wallie-spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
      }
      .wallie-hud-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(0, 168, 132, 0.25);
        border-top-color: #00a884;
        border-radius: 50%;
        animation: wallie-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
    </style>
    <div id="wallie-export-card" style="position: fixed; top: 72px; left: calc(50% - 225px); pointer-events: auto; background: #1f2c34; border: 1px solid #2a3942; border-radius: 14px; box-shadow: 0 16px 40px rgba(0,0,0,0.65); padding: 20px 24px; width: 450px; max-width: 90vw; display: flex; flex-direction: column; gap: 14px;">
      <div id="wallie-hud-header" style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #2a3942; padding-bottom: 10px; cursor: grab; user-select: none;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-weight: 600; font-size: 13px; color: #00a884;">WAllie Chat Exporter</span>
          <span style="font-size: 10px; color: #8696a0;">(drag to reposition)</span>
        </div>
        <span id="wallie-hud-badge" style="font-size: 11px; background: #111b21; border: 1px solid #2a3942; padding: 2px 8px; border-radius: 12px; color: #8696a0;">Chat 1 of 1</span>
      </div>

      <div>
        <div id="wallie-hud-title" style="font-size: 15px; font-weight: 600; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 6px;">Exporting Chat</div>
        <div style="display: flex; align-items: flex-start; gap: 10px; background: #111b21; padding: 10px 12px; border-radius: 8px; border: 1px solid #222d34;">
          <div class="wallie-hud-spinner" style="margin-top: 2px;"></div>
          <span id="wallie-hud-status" style="font-size: 12px; color: #8696a0; word-break: break-word; overflow-wrap: anywhere; white-space: normal; line-height: 1.4; max-height: 80px; overflow-y: auto;">Initializing export...</span>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; background: #111b21; padding: 10px; border-radius: 8px; border: 1px solid #222d34; text-align: center;">
        <div>
          <div style="font-size: 10px; color: #8696a0; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Messages</div>
          <div id="wallie-hud-msgs" style="font-size: 15px; font-weight: 700; color: #00a884;">0</div>
        </div>
        <div>
          <div style="font-size: 10px; color: #8696a0; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Media</div>
          <div id="wallie-hud-media" style="font-size: 15px; font-weight: 700; color: #53bdeb;">0</div>
        </div>
        <div>
          <div style="font-size: 10px; color: #8696a0; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">Oldest Date</div>
          <div id="wallie-hud-oldest" style="font-size: 12px; font-weight: 600; color: #e9edef; margin-top: 2px;">—</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 4px;">
        <button id="wallie-hud-skip-btn" style="display: none; background: #374248; color: #e9edef; border: none; font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 6px; cursor: pointer;">
          Skip
        </button>
        <button id="wallie-hud-cancel-btn" style="background: transparent; color: #ea4335; border: 1px solid #ea4335; font-size: 12px; font-weight: 500; padding: 6px 12px; border-radius: 6px; cursor: pointer; transition: all 0.2s;">
          Cancel Export
        </button>
      </div>
    </div>
    `;

    document.body.appendChild(overlay);

    const card = document.getElementById('wallie-export-card');
    const header = document.getElementById('wallie-hud-header');
    if (card && header) {
      let isDragging = false;
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;

      header.addEventListener('mousedown', (e: MouseEvent) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        const rect = card.getBoundingClientRect();
        initialLeft = rect.left;
        initialTop = rect.top;
        card.style.left = `${initialLeft}px`;
        card.style.top = `${initialTop}px`;
        header.style.cursor = 'grabbing';
        e.preventDefault();
      });

      window.addEventListener('mousemove', (e: MouseEvent) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const maxLeft = Math.max(10, window.innerWidth - card.offsetWidth - 10);
        const maxTop = Math.max(10, window.innerHeight - card.offsetHeight - 10);
        card.style.left = `${Math.max(10, Math.min(maxLeft, initialLeft + dx))}px`;
        card.style.top = `${Math.max(10, Math.min(maxTop, initialTop + dy))}px`;
      });

      window.addEventListener('mouseup', () => {
        if (isDragging) {
          isDragging = false;
          header.style.cursor = 'grab';
        }
      });
    }
  }

  const titleEl = document.getElementById('wallie-hud-title');
  if (titleEl) titleEl.textContent = state.title;

  const badgeEl = document.getElementById('wallie-hud-badge');
  if (badgeEl) badgeEl.textContent = `Chat ${state.index + 1} of ${state.total}`;

  const statusEl = document.getElementById('wallie-hud-status');
  if (statusEl) statusEl.textContent = state.statusText;

  const msgsEl = document.getElementById('wallie-hud-msgs');
  if (msgsEl) msgsEl.textContent = String(state.msgCount);

  const mediaEl = document.getElementById('wallie-hud-media');
  if (mediaEl) {
    if (typeof state.totalMedia === 'number' && state.totalMedia > 0) {
      const skipSuffix = state.skippedCount && state.skippedCount > 0 ? ` (${state.skippedCount} skipped)` : '';
      mediaEl.textContent = `${state.mediaCount}/${state.totalMedia}${skipSuffix}`;
      mediaEl.title = `${state.mediaCount} saved, ${state.skippedCount || 0} skipped of ${state.totalMedia} total`;
    } else {
      mediaEl.textContent = String(state.mediaCount);
    }
  }

  const oldestEl = document.getElementById('wallie-hud-oldest');
  if (oldestEl) {
    const rawDate = state.oldestDate || lastKnownOldestDate;
    if (rawDate) {
      const d = new Date(rawDate);
      oldestEl.textContent = isNaN(d.getTime())
        ? rawDate.slice(0, 10)
        : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } else {
      oldestEl.textContent = '—';
    }
  }

  const skipBtn = document.getElementById('wallie-hud-skip-btn') as HTMLButtonElement | null;
  if (skipBtn) {
    if (state.canSkip) {
      skipBtn.style.display = 'inline-block';
      skipBtn.textContent = state.skipLabel || 'Skip File';
      skipBtn.onclick = () => {
        if (state.onSkip) state.onSkip();
      };
    } else {
      skipBtn.style.display = 'none';
      skipBtn.onclick = null;
    }
  }

  const cancelBtn = document.getElementById('wallie-hud-cancel-btn') as HTMLButtonElement | null;
  if (cancelBtn) {
    if (!isCurrentJobAborted) {
      cancelBtn.textContent = 'Cancel Export';
      cancelBtn.disabled = false;
    }
    cancelBtn.onclick = () => {
      isCurrentJobAborted = true;
      cancelBtn.textContent = 'Aborting...';
      cancelBtn.disabled = true;
      (window as any).__wallie_ipc?.stopChatExport?.(state.exportId);
    };
  }
}

/**
 * Removes the floating HUD overlay from the DOM.
 */
export function removeExportHUD(): void {
  const overlay = document.getElementById('wallie-export-hud-overlay');
  if (overlay) overlay.remove();
}

/**
 * Renders the completion modal directly inside the WhatsApp DOM upon completion or failure.
 */
export function showExportCompletionModal(summary: {
  status: 'completed' | 'failed' | 'aborted';
  chatTitle: string;
  messagesCount: number;
  mediaCount: number;
  outputDirectory: string;
  htmlPath?: string;
  error?: string;
}): void {
  removeExportHUD();
  const existingModal = document.getElementById('wallie-export-modal-overlay');
  if (existingModal) existingModal.remove();

  const isSuccess = summary.status === 'completed';
  const isAborted = summary.status === 'aborted';

  const modal = document.createElement('div');
  modal.id = 'wallie-export-modal-overlay';
  modal.setAttribute(
    'style',
    'position: fixed; inset: 0; z-index: 2147483645; display: flex; align-items: center; justify-content: center; background: rgba(11, 20, 26, 0.55); backdrop-filter: none !important; -webkit-backdrop-filter: none !important; pointer-events: auto; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #e9edef; user-select: none; padding: 16px;'
  );

  const iconColor = isSuccess ? '#00a884' : (isAborted ? '#f59e0b' : '#ea4335');
  const iconSymbol = isSuccess ? '✓' : (isAborted ? '⚠' : '✕');
  const titleText = isSuccess ? 'Chat Export Completed' : (isAborted ? 'Export Cancelled' : 'Chat Export Failed');

  modal.innerHTML = `
  <style>
    #wallie-export-modal-overlay,
    #wallie-export-modal-overlay *,
    #wallie-export-modal-overlay button {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
    }
  </style>
  <div style="background: #1f2c34; border: 1px solid #2a3942; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.7); padding: 24px 28px; width: 480px; max-width: 92vw; display: flex; flex-direction: column; gap: 18px;">
    <div style="display: flex; align-items: center; gap: 14px; border-bottom: 1px solid #2a3942; padding-bottom: 16px;">
      <div style="width: 40px; height: 40px; border-radius: 50%; background: ${iconColor}22; border: 2px solid ${iconColor}; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: bold; color: ${iconColor}; flex-shrink: 0;">
        ${iconSymbol}
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="font-size: 17px; font-weight: 700; color: #e9edef;">${titleText}</div>
        <div style="font-size: 13px; color: #8696a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px;">${summary.chatTitle}</div>
      </div>
    </div>

    ${summary.error ? `
      <div style="background: rgba(234, 67, 53, 0.12); border: 1px solid #ea4335; border-radius: 8px; padding: 12px; color: #ea4335; font-size: 13px; line-height: 1.4;">
        <strong>Error:</strong> ${summary.error}
      </div>
    ` : ''}

    <div style="background: #111b21; border: 1px solid #222d34; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px; font-size: 13px;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8696a0;">Messages Exported:</span>
        <span style="font-weight: 600; color: #00a884;">${summary.messagesCount}</span>
      </div>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #8696a0;">Media Files Saved:</span>
        <span style="font-weight: 600; color: #53bdeb;">${summary.mediaCount}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span style="color: #8696a0;">Output Folder:</span>
        <span style="font-size: 11px; color: #aebac1; word-break: break-all; background: #182229; padding: 6px 8px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;">${summary.outputDirectory || '—'}</span>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 4px;">
      ${summary.outputDirectory ? `
        <button id="wallie-modal-open-folder-btn" style="background: #00a884; color: #111b21; border: none; font-size: 13px; font-weight: 600; padding: 11px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: opacity 0.2s;">
          📂 Open Output Folder
        </button>
      ` : ''}
      ${summary.htmlPath ? `
        <button id="wallie-modal-open-viewer-btn" style="background: #2a3942; color: #e9edef; border: 1px solid #374248; font-size: 13px; font-weight: 600; padding: 10px 16px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; transition: background 0.2s;">
          🌐 Open Standalone Viewer in Browser
        </button>
      ` : ''}
      <button id="wallie-modal-close-btn" style="background: transparent; color: #8696a0; border: 1px solid #374248; font-size: 13px; font-weight: 500; padding: 9px 16px; border-radius: 8px; cursor: pointer;">
        Close
      </button>
    </div>
  </div>
  `;

  document.body.appendChild(modal);

  const folderBtn = document.getElementById('wallie-modal-open-folder-btn');
  if (folderBtn) {
    folderBtn.onclick = () => {
      (window as any).__wallie_ipc?.showInFolder?.(summary.outputDirectory);
    };
  }

  const viewerBtn = document.getElementById('wallie-modal-open-viewer-btn');
  if (viewerBtn && summary.htmlPath) {
    viewerBtn.onclick = () => {
      (window as any).__wallie_ipc?.openPath?.(summary.htmlPath!);
    };
  }

  const closeBtn = document.getElementById('wallie-modal-close-btn');
  if (closeBtn) {
    closeBtn.onclick = () => {
      modal.remove();
    };
  }
}

