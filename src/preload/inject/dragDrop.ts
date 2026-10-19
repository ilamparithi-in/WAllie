import './types';

let fileDragCounter = 0;

function isFileDragEvent(e: DragEvent): boolean {
  if (!e.dataTransfer) return false;
  const types = Array.from(e.dataTransfer.types || []);
  return types.includes('Files');
}

function dispatchDroppedFilesToChat(dt: DataTransfer): boolean {
  if (!dt.files || dt.files.length === 0) return false;

  // Check if an active conversation panel is open
  const mainEl = (document.querySelector('#main') ||
                 document.querySelector('[data-testid="conversation-panel-wrapper"]') ||
                 document.querySelector('div[role="region"]')) as HTMLElement | null;

  if (!mainEl) {
    return false;
  }

  // 1. Try dispatching drop event to the conversation body or #main
  try {
    const dropTarget = mainEl.querySelector('[data-testid="conversation-panel-body"]') ||
                       mainEl.querySelector('.copyable-area') ||
                       mainEl;
    const dropEvt = new DragEvent('drop', {
      bubbles: true,
      cancelable: true,
      dataTransfer: dt,
    });
    const notCanceled = dropTarget.dispatchEvent(dropEvt);
    if (dropEvt.defaultPrevented || !notCanceled) {
      return true;
    }
  } catch (err) {
    console.warn('[walinux] Failed to dispatch drop event to chat:', err);
  }

  // 2. Try pasting into the composer (WhatsApp Web natively supports pasting image/file files)
  const composer = (
    mainEl.querySelector('footer div[contenteditable="true"][role="textbox"]') ||
    mainEl.querySelector('div[contenteditable="true"][data-tab="10"]') ||
    mainEl.querySelector('div[contenteditable="true"][data-tab="6"]') ||
    document.querySelector('footer div[contenteditable="true"]')
  ) as HTMLElement | null;

  if (composer) {
    try {
      composer.focus();
      const pasteEvt = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      const notCanceled = composer.dispatchEvent(pasteEvt);
      if (pasteEvt.defaultPrevented || !notCanceled) {
        return true;
      }
    } catch (err) {
      console.warn('[walinux] Failed to dispatch paste event to composer:', err);
    }
  }

  // 3. Fallback: Check if file inputs exist in the DOM (e.g. from attach menu)
  try {
    const fileInputs = Array.from(document.querySelectorAll('input[type="file"]')) as HTMLInputElement[];
    if (fileInputs.length > 0) {
      const isMedia = Array.from(dt.files).every((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
      const targetInput = fileInputs.find((input) => {
        const acc = input.getAttribute('accept') || '';
        return isMedia ? (acc.includes('image') || acc.includes('video')) : (acc === '*' || acc.includes('*/*'));
      }) || fileInputs[0];

      if (targetInput) {
        targetInput.files = dt.files;
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
    }
  } catch (err) {
    console.warn('[walinux] Failed to populate file input:', err);
  }

  return false;
}

export function initDragDropStabilizer(): void {
  // Inject a stylesheet to stabilize WhatsApp's drag overlay so child elements (icons, text)
  // don't trigger dragleave and cause the overlay to flicker or disappear.
  const dragStyle = document.createElement('style');
  dragStyle.id = 'walinux-drag-stabilizer';
  dragStyle.textContent = `
    body.walinux-file-dragging [data-testid*="drag"] *,
    body.walinux-file-dragging [data-testid*="drop"] *,
    body.walinux-file-dragging [data-testid*="overlay"] * {
      pointer-events: none !important;
    }
  `;
  if (document.head) {
    document.head.appendChild(dragStyle);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.head && !document.getElementById('walinux-drag-stabilizer')) {
        document.head.appendChild(dragStyle);
      }
    });
  }

  window.addEventListener('dragenter', (e: DragEvent) => {
    if (!e.isTrusted) return;
    if (isFileDragEvent(e)) {
      fileDragCounter++;
      document.body.classList.add('walinux-file-dragging');
    }
  }, true);

  window.addEventListener('dragleave', (e: DragEvent) => {
    if (!e.isTrusted) return;
    if (isFileDragEvent(e)) {
      fileDragCounter = Math.max(0, fileDragCounter - 1);
      if (fileDragCounter === 0) {
        document.body.classList.remove('walinux-file-dragging');
      }
    }
  }, true);

  // In bubble phase, prevent default so Chromium allows the drop and won't navigate to the file
  window.addEventListener('dragover', (e: DragEvent) => {
    if (!e.isTrusted) return;
    if (isFileDragEvent(e)) {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy';
      }
    }
  }, false);

  window.addEventListener('drop', (e: DragEvent) => {
    fileDragCounter = 0;
    document.body.classList.remove('walinux-file-dragging');

    if (!e.isTrusted || !isFileDragEvent(e)) return;

    const wasHandled = e.defaultPrevented;
    // Always prevent default navigation in Chromium
    e.preventDefault();
    e.stopPropagation();

    if (wasHandled) {
      return;
    }

    // If missed or unhandled by WhatsApp native overlay, dispatch to active chat if open
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      dispatchDroppedFilesToChat(e.dataTransfer);
    }
  }, false);
}
