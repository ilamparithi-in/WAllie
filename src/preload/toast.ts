const { ipcRenderer } = require('electron');

interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children?: SvgNode[];
}

function createSvgElement(node: SvgNode): SVGElement {
  const el = document.createElementNS('http://www.w3.org/2000/svg', node.tag);
  for (const [k, v] of Object.entries(node.attrs)) {
    el.setAttribute(k, v);
  }
  if (node.children) {
    for (const child of node.children) {
      el.appendChild(createSvgElement(child));
    }
  }
  return el;
}

export function showGuestToast(msg: string, url?: string): void {
  if (!document.body && !document.documentElement) return;

  let container = document.getElementById('wallie-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'wallie-toast-container';
    Object.assign(container.style, {
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: '999999',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
      maxWidth: '384px',
      pointerEvents: 'none',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    });
    (document.body || document.documentElement).appendChild(container);
  }

  // Deduplicate active toasts with exact same message
  const activeExisting = container.querySelector(`[data-toast-msg="${CSS.escape(msg)}"]:not([data-exiting="true"])`);
  if (activeExisting) {
    return;
  }

  if (!document.getElementById('wallie-toast-style')) {
    const style = document.createElement('style');
    style.id = 'wallie-toast-style';
    style.textContent = `
      @keyframes win10ToastEnter {
        0% { opacity: 0; transform: translateX(100%); }
        100% { opacity: 1; transform: translateX(0); }
      }
      @keyframes win10ToastExit {
        0% { opacity: 1; transform: translateX(0); }
        100% { opacity: 0; transform: translateX(100%); }
      }
      .wallie-toast-enter {
        animation: win10ToastEnter 0.3s cubic-bezier(0.1, 0.9, 0.2, 1) forwards !important;
      }
      .wallie-toast-exit {
        animation: win10ToastExit 0.3s cubic-bezier(0.1, 0.9, 0.2, 1) forwards !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  const isCancelled = msg.toLowerCase().includes('cancel');
  const canReopen = Boolean(isCancelled && url);

  const toast = document.createElement('div');
  toast.setAttribute('data-toast-msg', msg);
  toast.className = 'wallie-toast-enter';
  Object.assign(toast.style, {
    background: '#1f2c34',
    color: '#e9edef',
    border: isCancelled ? '1px solid rgba(241, 92, 109, 0.4)' : '1px solid rgba(0, 168, 132, 0.4)',
    padding: '14px',
    borderRadius: '12px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
    backdropFilter: 'blur(12px)',
    fontSize: '12px',
    maxWidth: '384px',
    pointerEvents: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    userSelect: 'none',
    boxSizing: 'border-box',
    transition: 'background 0.2s, border-color 0.2s',
  });

  if (canReopen) {
    toast.style.cursor = 'pointer';
    toast.title = 'Click to reopen prompt';
    toast.addEventListener('mouseenter', () => {
      toast.style.background = '#25323a';
      toast.style.borderColor = 'rgba(241, 92, 109, 0.8)';
    });
    toast.addEventListener('mouseleave', () => {
      toast.style.background = '#1f2c34';
      toast.style.borderColor = 'rgba(241, 92, 109, 0.4)';
    });
  }

  let isExiting = false;
  const dismiss = () => {
    if (isExiting) return;
    isExiting = true;
    toast.setAttribute('data-exiting', 'true');
    toast.className = 'wallie-toast-exit';
    setTimeout(() => toast.remove(), 300);
  };

  if (canReopen && url) {
    toast.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.wallie-toast-close')) return;
      ipcRenderer.send('protocol:reopen-prompt', url);
      dismiss();
    });
  }

  // Icon box
  const iconBox = document.createElement('div');
  Object.assign(iconBox.style, {
    background: isCancelled ? 'rgba(241, 92, 109, 0.2)' : 'rgba(0, 168, 132, 0.2)',
    color: isCancelled ? '#f15c6d' : '#00a884',
    padding: '8px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
  });

  const iconSvg = isCancelled
    ? createSvgElement({
      tag: 'svg',
      attrs: { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      children: [
        { tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } },
        { tag: 'line', attrs: { x1: '15', y1: '9', x2: '9', y2: '15' } },
        { tag: 'line', attrs: { x1: '9', y1: '9', x2: '15', y2: '15' } },
      ],
    })
    : createSvgElement({
      tag: 'svg',
      attrs: { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
      children: [
        { tag: 'path', attrs: { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' } },
        { tag: 'polyline', attrs: { points: '15 3 21 3 21 9' } },
        { tag: 'line', attrs: { x1: '10', y1: '14', x2: '21', y2: '3' } },
      ],
    });
  iconBox.appendChild(iconSvg);
  toast.appendChild(iconBox);

  // Text column
  const textCol = document.createElement('div');
  Object.assign(textCol.style, {
    flex: '1',
    minWidth: '0',
  });

  const msgEl = document.createElement('p');
  Object.assign(msgEl.style, {
    margin: '0',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.25',
    color: '#e9edef',
  });
  msgEl.textContent = msg;
  textCol.appendChild(msgEl);

  if (url) {
    const urlEl = document.createElement('p');
    Object.assign(urlEl.style, {
      margin: '0',
      marginTop: '2px',
      fontSize: '10px',
      color: '#8696a0',
      whiteSpace: 'nowrap',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
    });
    urlEl.title = url;
    urlEl.textContent = url;
    textCol.appendChild(urlEl);
  }

  if (canReopen) {
    const hintEl = document.createElement('p');
    Object.assign(hintEl.style, {
      margin: '0',
      marginTop: '4px',
      fontSize: '9px',
      color: '#f15c6d',
      fontWeight: '500',
    });
    hintEl.textContent = 'Click to reopen prompt';
    textCol.appendChild(hintEl);
  }

  toast.appendChild(textCol);

  // Close (X) button
  const closeBtn = document.createElement('button');
  closeBtn.className = 'wallie-toast-close';
  closeBtn.title = 'Dismiss';
  Object.assign(closeBtn.style, {
    background: 'transparent',
    border: 'none',
    color: '#8696a0',
    padding: '4px',
    borderRadius: '6px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: '0',
    transition: 'all 0.2s',
  });
  closeBtn.addEventListener('mouseenter', () => {
    closeBtn.style.color = '#e9edef';
    closeBtn.style.background = '#2a3942';
  });
  closeBtn.addEventListener('mouseleave', () => {
    closeBtn.style.color = '#8696a0';
    closeBtn.style.background = 'transparent';
  });
  const closeSvg = createSvgElement({
    tag: 'svg',
    attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' },
    children: [
      { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
      { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } },
    ],
  });
  closeBtn.appendChild(closeSvg);
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dismiss();
  });
  toast.appendChild(closeBtn);

  container.appendChild(toast);

  // KDE-style Expiration Progress Bar at the Top
  const progressBarTrack = document.createElement('div');
  Object.assign(progressBarTrack.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    right: '0',
    height: '3px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderTopLeftRadius: '12px',
    borderTopRightRadius: '12px',
    overflow: 'hidden',
  });

  const progressBarFill = document.createElement('div');
  Object.assign(progressBarFill.style, {
    height: '100%',
    width: '100%',
    background: isCancelled ? '#f15c6d' : '#00a884',
    transition: 'none',
  });
  progressBarTrack.appendChild(progressBarFill);
  toast.appendChild(progressBarTrack);

  toast.style.position = 'relative';
  toast.style.overflow = 'hidden';

  const duration = 4500;
  let startTime = Date.now();
  let animId: number | null = null;
  let isHovered = false;

  const tick = () => {
    if (isExiting) return;
    if (isHovered) return;

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
    progressBarFill.style.width = remaining + '%';

    if (elapsed >= duration) {
      dismiss();
    } else {
      animId = requestAnimationFrame(tick);
    }
  };

  animId = requestAnimationFrame(tick);

  toast.addEventListener('mouseenter', () => {
    isHovered = true;
    progressBarFill.style.width = '100%';
    startTime = Date.now();
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
  });

  toast.addEventListener('mouseleave', () => {
    if (isExiting) return;
    isHovered = false;
    startTime = Date.now();
    animId = requestAnimationFrame(tick);
  });
}

