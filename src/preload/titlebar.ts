const { ipcRenderer } = require('electron');

interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children?: SvgNode[];
}

export function createSvgElement(node: SvgNode): SVGElement {
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

export const TITLEBAR_CSS = `
  html, body {
    background-color: #111b21 !important;
    margin: 0 !important;
    padding: 0 !important;
    height: 100% !important;
    overflow: hidden !important;
  }
  body > :not(#custom-titlebar) {
    transform: translateY(28px) !important;
    height: calc(100% - 28px) !important;
  }
  #custom-titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 28px;
    background-color: #111b21;
    border-bottom: 1px solid #222d34;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #aebac1;
    font-size: 11px;
    font-weight: 500;
    z-index: 999999;
    user-select: none;
  }
  .titlebar-left {
    display: flex;
    align-items: center;
    gap: 6px;
    padding-left: 10px;
    -webkit-app-region: no-drag;
  }
  #custom-titlebar.titlebar-mac .titlebar-left {
    padding-left: 78px;
  }
  #custom-titlebar.titlebar-mac.fullscreen .titlebar-left {
    padding-left: 10px;
  }
  .titlebar-left-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    color: #00a884;
  }
  .titlebar-left-icon svg {
    width: 14px;
    height: 14px;
  }
  .titlebar-left-title {
    color: #e9edef;
    font-weight: 600;
  }
  .titlebar-left-badge {
    padding: 1px 6px;
    background: rgba(0, 168, 132, 0.1);
    border: 1px solid rgba(0, 168, 132, 0.2);
    color: #00a884;
    border-radius: 4px;
    font-size: 9px;
    font-weight: bold;
  }
  .titlebar-drag-region {
    flex: 1;
    height: 100%;
    -webkit-app-region: drag;
    cursor: move;
  }
  .titlebar-right {
    display: flex;
    align-items: center;
    height: 100%;
    gap: 2px;
    padding-right: 4px;
    -webkit-app-region: no-drag;
  }
  #custom-titlebar.titlebar-mac .titlebar-right {
    padding-right: 8px;
  }
  .titlebar-btn {
    width: 28px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    color: #8696a0;
    cursor: pointer;
    transition: background-color 0.2s, color 0.2s;
  }
  .titlebar-btn-close {
    width: 32px;
  }
  .titlebar-btn:hover {
    background-color: #202c33;
    color: #e9edef;
  }
  .titlebar-btn-close:hover {
    background-color: #ea4335 !important;
    color: #ffffff !important;
  }
  .titlebar-btn-close:hover svg {
    stroke: #ffffff !important;
    color: #ffffff !important;
  }
  .titlebar-btn svg {
    width: 13px;
    height: 13px;
  }
  .titlebar-divider {
    height: 12px;
    width: 1px;
    background-color: #222d34;
    margin: 0 4px;
  }
  @media (prefers-color-scheme: light) {
    #custom-titlebar {
      background-color: #f0f2f5 !important;
      border-bottom: 1px solid #d1d7db !important;
      color: #54656f !important;
    }
    .titlebar-left-title {
      color: #111b21 !important;
    }
    .titlebar-btn:hover {
      background-color: #e9edef !important;
      color: #111b21 !important;
    }
    .titlebar-divider {
      background-color: #d1d7db !important;
    }
  }
`;

export function injectUnifiedTitlebar(options: {
  title: string;
  badge?: string;
  iconType: 'call' | 'devtools';
  controls: ('pin' | 'min' | 'max' | 'close')[];
}): void {
  if (!document.documentElement || !document.body) {
    setTimeout(() => injectUnifiedTitlebar(options), 50);
    return;
  }

  if (document.getElementById('custom-titlebar')) return;

  const style = document.createElement('style');
  style.id = 'custom-titlebar-styles';
  style.textContent = TITLEBAR_CSS;
  document.documentElement.appendChild(style);

  const phoneIcon = createSvgElement({
    tag: 'svg',
    attrs: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [{ tag: 'path', attrs: { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' } }]
  });

  const codeIcon = createSvgElement({
    tag: 'svg',
    attrs: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      { tag: 'polyline', attrs: { points: '16 18 22 12 16 6' } },
      { tag: 'polyline', attrs: { points: '8 6 2 12 8 18' } }
    ]
  });

  const createPinIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      { tag: 'line', attrs: { x1: '12', y1: '17', x2: '12', y2: '22' } },
      { tag: 'path', attrs: { d: 'M5 17h14v-1.76a2 2 0 0 0-.44-1.24l-2.78-3.5A2 2 0 0 1 15 9.24V5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v4.24a2 2 0 0 1-.78 1.28l-2.78 3.5a2 2 0 0 0-.44 1.24z' } }
    ]
  });

  const createMinIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [{ tag: 'line', attrs: { x1: '5', y1: '12', x2: '19', y2: '12' } }]
  });

  const createMaxIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { id: 'max-icon-svg', width: '12', height: '12', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      {
        tag: 'g',
        attrs: { id: 'max-icon-unmaxed' },
        children: [{ tag: 'rect', attrs: { width: '18', height: '18', x: '3', y: '3', rx: '2' } }]
      },
      {
        tag: 'g',
        attrs: { id: 'max-icon-maxed', style: 'display: none' },
        children: [
          { tag: 'rect', attrs: { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' } },
          { tag: 'path', attrs: { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' } }
        ]
      }
    ]
  });

  const createCloseIcon = () => createSvgElement({
    tag: 'svg',
    attrs: { width: '14', height: '14', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' },
    children: [
      { tag: 'line', attrs: { x1: '18', y1: '6', x2: '6', y2: '18' } },
      { tag: 'line', attrs: { x1: '6', y1: '6', x2: '18', y2: '18' } }
    ]
  });

  const isMac = process.platform === 'darwin';
  const container = document.createElement('div');
  container.id = 'custom-titlebar';
  if (isMac) {
    container.classList.add('titlebar-mac');
    ipcRenderer.invoke('window:isFullScreen').then((fs: boolean) => {
      if (fs) container.classList.add('fullscreen');
    }).catch(() => { });
    ipcRenderer.on('window:fullscreen-changed', (_event: any, fs: boolean) => {
      if (fs) {
        container.classList.add('fullscreen');
      } else {
        container.classList.remove('fullscreen');
      }
    });
  }

  const leftDiv = document.createElement('div');
  leftDiv.className = 'titlebar-left';

  const leftIconSpan = document.createElement('span');
  leftIconSpan.className = 'titlebar-left-icon';
  leftIconSpan.appendChild(options.iconType === 'call' ? phoneIcon : codeIcon);
  leftDiv.appendChild(leftIconSpan);

  const leftTitleSpan = document.createElement('span');
  leftTitleSpan.className = 'titlebar-left-title';
  leftTitleSpan.textContent = options.title || '';
  leftDiv.appendChild(leftTitleSpan);

  if (options.badge) {
    const badgeSpan = document.createElement('span');
    badgeSpan.className = 'titlebar-left-badge';
    badgeSpan.textContent = options.badge;
    leftDiv.appendChild(badgeSpan);
  }

  const dragRegion = document.createElement('div');
  dragRegion.className = 'titlebar-drag-region';

  const rightDiv = document.createElement('div');
  rightDiv.className = 'titlebar-right';

  let pinBtn: HTMLButtonElement | null = null;
  let minBtn: HTMLButtonElement | null = null;
  let maxBtn: HTMLButtonElement | null = null;
  let closeBtn: HTMLButtonElement | null = null;

  const effectiveControls = isMac
    ? options.controls.filter((c) => c === 'pin')
    : options.controls;

  effectiveControls.forEach((control) => {
    if (control === 'pin') {
      pinBtn = document.createElement('button');
      pinBtn.className = 'titlebar-btn';
      pinBtn.id = 'pin-btn';
      pinBtn.title = 'Pin (Stay on Top)';
      pinBtn.appendChild(createPinIcon());
      rightDiv.appendChild(pinBtn);

      if (!isMac) {
        const divider = document.createElement('div');
        divider.className = 'titlebar-divider';
        rightDiv.appendChild(divider);
      }
    } else if (control === 'min') {
      minBtn = document.createElement('button');
      minBtn.className = 'titlebar-btn';
      minBtn.id = 'min-btn';
      minBtn.title = 'Minimize';
      minBtn.appendChild(createMinIcon());
      rightDiv.appendChild(minBtn);
    } else if (control === 'max') {
      maxBtn = document.createElement('button');
      maxBtn.className = 'titlebar-btn';
      maxBtn.id = 'max-btn';
      maxBtn.title = 'Maximize';
      maxBtn.appendChild(createMaxIcon());
      rightDiv.appendChild(maxBtn);
    } else if (control === 'close') {
      closeBtn = document.createElement('button');
      closeBtn.className = 'titlebar-btn titlebar-btn-close';
      closeBtn.id = 'close-btn';
      closeBtn.title = 'Close';
      closeBtn.appendChild(createCloseIcon());
      rightDiv.appendChild(closeBtn);
    }
  });

  container.appendChild(leftDiv);
  container.appendChild(dragRegion);
  container.appendChild(rightDiv);

  document.body.appendChild(container);

  if (pinBtn) {
    ipcRenderer.invoke('window:get-always-on-top').then((isPinned: boolean) => {
      (pinBtn as HTMLButtonElement).style.color = isPinned ? '#00a884' : '#8696a0';
    });

    (pinBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:toggle-always-on-top');
    });

    ipcRenderer.on('window:always-on-top-changed', (_event: any, isPinned: boolean) => {
      if (pinBtn) {
        pinBtn.style.color = isPinned ? '#00a884' : '#8696a0';
      }
    });
  }

  if (minBtn) {
    (minBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:minimize');
    });
  }

  if (maxBtn) {
    (maxBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:maximize');
    });

    ipcRenderer.on('window:maximized-changed', (_event: any, isMaximized: boolean) => {
      const maxSvg = document.getElementById('max-icon-svg');
      const unmaxedG = document.getElementById('max-icon-unmaxed');
      const maxedG = document.getElementById('max-icon-maxed');
      if (maxSvg && unmaxedG && maxedG) {
        if (isMaximized) {
          maxSvg.setAttribute('style', 'transform: rotate(180deg); width: 12px; height: 12px;');
          unmaxedG.setAttribute('style', 'display: none');
          maxedG.removeAttribute('style');
        } else {
          maxSvg.removeAttribute('style');
          maxSvg.setAttribute('style', 'width: 12px; height: 12px;');
          unmaxedG.removeAttribute('style');
          maxedG.setAttribute('style', 'display: none');
        }
      }
    });
  }

  if (closeBtn) {
    (closeBtn as HTMLButtonElement).addEventListener('click', () => {
      ipcRenderer.send('window:close');
    });
  }
}

