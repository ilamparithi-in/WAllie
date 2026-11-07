import './types';

export type ResponsiveLayoutMode = 'disabled' | 'auto' | 'portrait';
export type PortraitViewState = 'list' | 'chat' | 'info';

const STYLE_ID = 'walinux-responsive-layout-style';
const BACK_BTN_CLASS = 'walinux-back-button';

let currentMode: ResponsiveLayoutMode = 'auto';
let isPortraitActive = false;
let isLandscapeSidebarCollapsed = false;
let currentViewState: PortraitViewState = 'list';

const RESPONSIVE_CSS = `
  /* Hard minimum-width override for WhatsApp Web containers */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div.two,
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div.three {
    min-width: 0 !important;
    width: 100% !important;
    overflow: hidden !important;
    position: relative !important;
  }

  /* Pinned Left Navigation Rail */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > header[data-testid="chatlist-header"] {
    width: 64px !important;
    min-width: 64px !important;
    max-width: 64px !important;
    flex: 0 0 64px !important;
    position: relative !important;
    z-index: 500 !important;
  }

  /* Fullscreen Drawer (Status / Media Viewer) */
  html[data-walinux-portrait="true"] [data-testid="drawer-fullscreen"] {
    left: 64px !important;
    width: calc(100% - 64px) !important;
    max-width: calc(100% - 64px) !important;
    z-index: 600 !important;
  }

  /* Drawer Container c2 (Houses drawer-left and drawer-middle) */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) {
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    height: 100% !important;
    pointer-events: none !important;
    z-index: 300 !important;
  }

  /* Left Drawer (Calls, Status, Channels, Communities, Settings, Profile) */
  html[data-walinux-portrait="true"] [data-testid="drawer-left"] {
    pointer-events: auto !important;
    position: absolute !important;
    left: 64px !important;
    margin-left: 0 !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    max-width: calc(100% - 64px) !important;
    min-width: calc(100% - 64px) !important;
    flex: 0 0 calc(100% - 64px) !important;
    height: 100% !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-left"]:not(:has(header)) {
    display: none !important;
    pointer-events: none !important;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-left"] > * {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* Middle Drawer (Call Info, Camera Capture, Attachment Preview) */
  html[data-walinux-portrait="true"] [data-testid="drawer-middle"] {
    pointer-events: auto !important;
    position: absolute !important;
    left: 64px !important;
    margin-left: 0 !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    max-width: calc(100% - 64px) !important;
    min-width: calc(100% - 64px) !important;
    flex: 0 0 calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 350 !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-middle"]:not(:has(header)):not(:has(button)) {
    display: none !important;
    pointer-events: none !important;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-middle"] > * {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* c3: Chats List Pane (#pane-side container) */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div {
    position: absolute !important;
    left: 64px !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    max-width: calc(100% - 64px) !important;
    min-width: calc(100% - 64px) !important;
    flex: 0 0 calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 200 !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }

  /* c4: Active Conversation Pane (#main container) */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div + div {
    position: absolute !important;
    left: 64px !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    max-width: calc(100% - 64px) !important;
    min-width: calc(100% - 64px) !important;
    flex: 0 0 calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 250 !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }
  html[data-walinux-portrait="true"] #main {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 100% !important;
  }

  /* c6: Right Drawer (Contact/Group/Channel Info) */
  html[data-walinux-portrait="true"] [data-testid="drawer-right"] {
    position: absolute !important;
    left: 64px !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    max-width: calc(100% - 64px) !important;
    min-width: calc(100% - 64px) !important;
    flex: 0 0 calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 400 !important;
    animation: none !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-right"] > * {
    width: 100% !important;
    max-width: 100% !important;
  }

  /* ---------------- STATE 1: LIST VIEW ---------------- */
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div,
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="drawer-left"] {
    transform: translate3d(0, 0, 0) !important;
    visibility: visible !important;
    pointer-events: auto !important;
  }
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div + div,
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="drawer-middle"],
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="drawer-right"] {
    transform: translate3d(100%, 0, 0) !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  /* ---------------- STATE 2: CHAT VIEW ---------------- */
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div,
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="drawer-left"] {
    transform: translate3d(-100%, 0, 0) !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div + div,
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="drawer-middle"] {
    transform: translate3d(0, 0, 0) !important;
    visibility: visible !important;
    pointer-events: auto !important;
  }
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="drawer-right"] {
    transform: translate3d(100%, 0, 0) !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  /* ---------------- STATE 3: INFO VIEW ---------------- */
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div,
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="drawer-left"],
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div + div,
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="drawer-middle"] {
    transform: translate3d(-100%, 0, 0) !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="drawer-right"] {
    transform: translate3d(0, 0, 0) !important;
    visibility: visible !important;
    pointer-events: auto !important;
  }

  /* ---------------- LANDSCAPE MODE: SIDEBAR COLLAPSED ---------------- */
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div,
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] [data-testid="drawer-left"] {
    display: none !important;
  }
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] [data-testid="wa-web-main-screen"] > div > div:has(> [data-testid="drawer-left"]) + div + div {
    flex: 1 1 auto !important;
    width: auto !important;
    max-width: none !important;
  }
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] [data-testid="drawer-middle"] {
    margin-left: 64px !important;
    flex: 1 1 auto !important;
    width: calc(100% - 64px) !important;
    max-width: none !important;
  }

  /* Emoji / GIFs / Stickers Flyout Panel Positioning & Width Constraint */
  html[data-walinux-portrait="true"] #expressions-panel-container div:has(> [data-testid="expressions-panel"]),
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] #expressions-panel-container div:has(> [data-testid="expressions-panel"]) {
    left: 68px !important;
    right: auto !important;
    max-width: calc(100vw - 76px) !important;
    width: min(560px, calc(100vw - 76px)) !important;
  }
  html[data-walinux-portrait="true"] #expressions-panel-container [data-testid="expressions-panel"],
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] #expressions-panel-container [data-testid="expressions-panel"] {
    max-width: 100% !important;
    width: 100% !important;
  }

  /* Attachment Popup Menu Positioning */
  html[data-walinux-portrait="true"] div.xu96u03[style*="-50%, -100%)"],
  html:not([data-walinux-portrait="true"])[data-walinux-sidebar-collapsed="true"] div.xu96u03[style*="-50%, -100%)"] {
    left: 52px !important;
  }

  /* Injected Back Button */
  .${BACK_BTN_CLASS} {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    min-width: 40px;
    border-radius: 50%;
    cursor: pointer;
    background: transparent;
    border: none;
    color: var(--icon, var(--icon-lighter, #aebac1));
    margin-right: 4px;
    padding: 0;
    outline: none;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
  }
  .${BACK_BTN_CLASS} svg {
    display: block;
    width: 24px;
    height: 24px;
    fill: currentColor;
  }
  .${BACK_BTN_CLASS}:hover {
    background-color: var(--background-default-hover, rgba(255, 255, 255, 0.08));
    color: var(--icon-lighter, #e9edef);
  }
  .${BACK_BTN_CLASS}:active {
    background-color: var(--background-default-active, rgba(255, 255, 255, 0.12));
  }
  html:not([data-walinux-portrait="true"]) .${BACK_BTN_CLASS} {
    display: none !important;
  }
`;

function ensureStyleSheet(): void {
  let styleEl = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(styleEl);
    } else if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        (document.head || document.documentElement)?.appendChild(styleEl!);
      }, { once: true });
    }
  }
  if (styleEl && styleEl.textContent !== RESPONSIVE_CSS) {
    styleEl.textContent = RESPONSIVE_CSS;
  }
}

export function setPortraitViewState(view: PortraitViewState): void {
  currentViewState = view;
  if (isPortraitActive && document.documentElement) {
    document.documentElement.setAttribute('data-portrait-view', view);
    window.dispatchEvent(new Event('resize'));
  }
}

export function getPortraitViewState(): PortraitViewState {
  return currentViewState;
}

function updateLandscapeSidebar(): void {
  if (!document.documentElement) return;
  if (!isPortraitActive && isLandscapeSidebarCollapsed) {
    document.documentElement.setAttribute('data-walinux-sidebar-collapsed', 'true');
  } else {
    document.documentElement.removeAttribute('data-walinux-sidebar-collapsed');
  }
  window.dispatchEvent(new Event('resize'));
}

function updatePortraitState(): void {
  if (!document.documentElement) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', updatePortraitState, { once: true });
    }
    return;
  }

  ensureStyleSheet();

  let shouldBePortrait = false;
  if (currentMode === 'disabled') {
    shouldBePortrait = false;
  } else if (currentMode === 'portrait') {
    shouldBePortrait = true;
  } else {
    // 'auto': check window dimensions or portrait aspect ratio
    const w = window.innerWidth;
    const h = window.innerHeight;
    shouldBePortrait = w <= 900 || w < h;
  }

  if (isPortraitActive !== shouldBePortrait) {
    isPortraitActive = shouldBePortrait;
    if (isPortraitActive) {
      document.documentElement.setAttribute('data-walinux-portrait', 'true');
      document.documentElement.setAttribute('data-portrait-view', currentViewState);
      document.documentElement.removeAttribute('data-walinux-sidebar-collapsed');
      lockMainScreenScroll();
    } else {
      document.documentElement.removeAttribute('data-walinux-portrait');
      document.documentElement.removeAttribute('data-portrait-view');
      updateLandscapeSidebar();
    }
    window.dispatchEvent(new Event('resize'));
  }
}

function lockMainScreenScroll(): void {
  const container = document.querySelector<HTMLElement>('[data-testid="wa-web-main-screen"] > div');
  if (!container) return;

  if (!(container as any).__walinuxScrollLocked) {
    (container as any).__walinuxScrollLocked = true;

    const origDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft');
    if (origDescriptor) {
      Object.defineProperty(container, 'scrollLeft', {
        get() {
          return origDescriptor.get ? origDescriptor.get.call(this) : 0;
        },
        set(val) {
          if (isPortraitActive) {
            // Enforce 0 in portrait mode to prevent native column sliding from breaking fixed/absolute rail layout
            if (origDescriptor.set) origDescriptor.set.call(this, 0);
            return;
          }
          if (origDescriptor.set) origDescriptor.set.call(this, val);
        },
        configurable: true,
      });
    }

    const origScrollTo = container.scrollTo;
    if (origScrollTo) {
      container.scrollTo = function (optionsOrX?: any, y?: any) {
        if (isPortraitActive) {
          if (typeof optionsOrX === 'object' && optionsOrX !== null) {
            optionsOrX = { ...optionsOrX, left: 0 };
          } else {
            optionsOrX = 0;
          }
        }
        return origScrollTo.apply(this, arguments as any);
      };
    }

    container.addEventListener(
      'scroll',
      () => {
        if (isPortraitActive && container.scrollLeft !== 0) {
          if (origDescriptor?.set) {
            origDescriptor.set.call(container, 0);
          } else {
            container.scrollLeft = 0;
          }
        }
      },
      { passive: false }
    );
  }

  if (isPortraitActive && container.scrollLeft !== 0) {
    container.scrollLeft = 0;
  }
}

function createBackButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `${BACK_BTN_CLASS} html-button`;
  btn.setAttribute('type', 'button');
  btn.setAttribute('aria-label', 'Back');
  btn.setAttribute('title', 'Back');

  btn.innerHTML = `
    <span aria-hidden="true">
      <svg viewBox="0 0 24 24" height="24" width="24" preserveAspectRatio="xMidYMid meet" fill="currentColor">
        <title>ic-arrow-back</title>
        <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"></path>
      </svg>
    </span>
  `;

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setPortraitViewState('list');
  });

  return btn;
}

function injectBackButton(): void {
  const headerContainer = document.querySelector('#main header > div:first-child');
  if (!headerContainer) return;

  const existingBtn = headerContainer.querySelector(`.${BACK_BTN_CLASS}`);
  if (!existingBtn) {
    const backBtn = createBackButton();
    headerContainer.insertBefore(backBtn, headerContainer.firstChild);
  }
}

function getActiveTabLabel(): string {
  const activeBtn = document.querySelector('[data-testid="wa-web-main-screen"] > div > header button[aria-pressed="true"]');
  return activeBtn?.getAttribute('aria-label')?.toLowerCase() || 'chats';
}

function setupEventListeners(): void {
  // 1. Navigation rail click interception (capture phase)
  window.addEventListener(
    'click',
    (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const railButton = target.closest<HTMLButtonElement>(
        '[data-testid="wa-web-main-screen"] > div > header[data-testid="chatlist-header"] button'
      );
      if (railButton) {
        const isCurrentlyActive = railButton.getAttribute('aria-pressed') === 'true';
        if (isCurrentlyActive) {
          const activeTab = getActiveTabLabel();

          // Communities tab has an empty right section by default, so disable toggling from list to right pane
          if (activeTab.includes('communit')) {
            if (isPortraitActive && (currentViewState === 'chat' || currentViewState === 'info')) {
              setPortraitViewState('list');
            }
            return;
          }

          if (isPortraitActive) {
            // In portrait mode: toggle between List and Chat view
            if (currentViewState === 'chat' || currentViewState === 'info') {
              setPortraitViewState('list');
            } else {
              setPortraitViewState('chat');
            }
          } else {
            // In landscape mode: toggle left sidebar collapse on/off
            isLandscapeSidebarCollapsed = !isLandscapeSidebarCollapsed;
            updateLandscapeSidebar();
          }
        } else {
          // Switching tabs:
          if (isPortraitActive) {
            // Always initialize new tab in list view
            setPortraitViewState('list');
          } else {
            // In landscape mode, clicking a new tab restores the sidebar
            if (isLandscapeSidebarCollapsed) {
              isLandscapeSidebarCollapsed = false;
              updateLandscapeSidebar();
            }
          }
        }
        return;
      }

      // 2. Chat list item click (in Chats tab)
      const chatListItem = target.closest(
        '#side [role="row"], #side [data-testid^="list-item-"], #side [role="listitem"]'
      );
      if (chatListItem) {
        if (isPortraitActive) {
          setPortraitViewState('chat');
          setTimeout(injectBackButton, 50);
        }
        return;
      }

      // 3. Drawer-left item clicks (Calls, Channels, Communities, Status)
      const drawerLeftItem = target.closest(
        '[data-testid="drawer-left"] [role="row"], [data-testid="drawer-left"] [data-testid^="list-item-"], [data-testid="drawer-left"] [role="listitem"], [data-testid="drawer-left"] [role="button"]'
      );
      if (drawerLeftItem) {
        const activeTab = getActiveTabLabel();
        if (activeTab.includes('call')) {
          // Clicking a call history item opens Call Info in drawer-middle
          if (isPortraitActive) {
            setPortraitViewState('chat');
          }
        } else if (activeTab.includes('channel')) {
          // Clicking a channel opens chat in #main
          if (isPortraitActive) {
            setPortraitViewState('chat');
            setTimeout(injectBackButton, 50);
          }
        } else if (activeTab.includes('communit')) {
          // In communities: sub-groups / announcements open #main, community headers just expand
          const isSubgroup = !!target.closest(
            '[data-testid="community-tab-subgroup-cell"], [data-testid="cell-frame-container"]'
          );
          const isCommunityHeader = !!target.closest(
            '[data-testid="community-tab-community-cell"], [data-testid="new-community-row"]'
          );
          if (isSubgroup && !isCommunityHeader) {
            if (isPortraitActive) {
              setPortraitViewState('chat');
              setTimeout(injectBackButton, 50);
            }
          }
          return;
        }
        return;
      }

      // 4. Click on chat header title/avatar to open Right Drawer (Contact/Group Info)
      const chatHeaderTitle = target.closest('#main header > div:first-child [role="button"]');
      if (chatHeaderTitle && !chatHeaderTitle.classList.contains(BACK_BTN_CLASS)) {
        setTimeout(() => {
          const drawerRight = document.querySelector('[data-testid="drawer-right"]');
          if (isPortraitActive && drawerRight && drawerRight.children.length > 0) {
            setPortraitViewState('info');
          }
        }, 120);
        return;
      }

      // 5. Click on Right Drawer Close Button
      const drawerRightClose = target.closest(
        '[data-testid="drawer-right"] button[aria-label="Close"], [data-testid="drawer-right"] [aria-label="Close"]'
      );
      if (drawerRightClose) {
        if (isPortraitActive) {
          setPortraitViewState('chat');
        }
        return;
      }

      // 6. Click on Middle Drawer Close Button (Call Info, Camera, Media Preview)
      const drawerMiddleClose = target.closest(
        '[data-testid="drawer-middle"] button[aria-label="Close"], [data-testid="drawer-middle"] [aria-label="Close"]'
      );
      if (drawerMiddleClose) {
        if (isPortraitActive) {
          const activeTab = getActiveTabLabel();
          if (activeTab.includes('call')) {
            setPortraitViewState('list');
          } else {
            setPortraitViewState('chat');
          }
        }
        return;
      }
    },
    true
  );

  // Window resize & media query observers
  window.addEventListener('resize', () => {
    updatePortraitState();
  });
  try {
    const mqWidth = window.matchMedia('(max-width: 900px)');
    const mqPortrait = window.matchMedia('(orientation: portrait)');
    mqWidth.addEventListener('change', () => updatePortraitState());
    mqPortrait.addEventListener('change', () => updatePortraitState());
  } catch (e) { }

  // DOM observer to monitor right drawer, middle drawer, and back button injection
  const observer = new MutationObserver(() => {
    if (!isPortraitActive) return;

    lockMainScreenScroll();

    // Check if right drawer opened
    const drawerRight = document.querySelector('[data-testid="drawer-right"]');
    const container = document.querySelector('[data-testid="wa-web-main-screen"] > div');
    const isThreeColumns = container?.classList.contains('three');

    if (isThreeColumns && drawerRight && drawerRight.clientWidth > 10 && currentViewState !== 'info') {
      setPortraitViewState('info');
    } else if (!isThreeColumns && currentViewState === 'info') {
      setPortraitViewState('chat');
    }

    // Ensure back button exists in #main header if in chat view
    if (currentViewState === 'chat') {
      injectBackButton();
    }
  });

  const startObserving = () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
  };

  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving, { once: true });
  }
}

export function setResponsiveLayoutMode(mode: ResponsiveLayoutMode): void {
  currentMode = mode;
  updatePortraitState();
}

export function initResponsiveLayout(): void {
  ensureStyleSheet();
  updatePortraitState();
  lockMainScreenScroll();
  setupEventListeners();

  // Load initial mode from IPC if available
  if (window.__walinux_ipc?.getResponsiveLayoutMode) {
    window.__walinux_ipc.getResponsiveLayoutMode().then((mode) => {
      if (mode) {
        setResponsiveLayoutMode(mode);
      }
    }).catch(() => { });
  }

  // Subscribe to runtime mode changes
  if (window.__walinux_ipc?.onResponsiveLayoutModeChanged) {
    window.__walinux_ipc.onResponsiveLayoutModeChanged((mode) => {
      if (mode) {
        setResponsiveLayoutMode(mode);
      }
    });
  }
}
