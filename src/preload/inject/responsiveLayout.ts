import './types';

export type ResponsiveLayoutMode = 'disabled' | 'auto' | 'portrait';
export type PortraitViewState = 'list' | 'chat' | 'info';

const STYLE_ID = 'walinux-responsive-layout-style';
const BACK_BTN_CLASS = 'walinux-back-button';

let currentMode: ResponsiveLayoutMode = 'auto';
let isPortraitActive = false;
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
    z-index: 600 !important;
  }

  /* Drawer Container c2 (Houses drawer-left and drawer-middle) */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > div:nth-child(3) {
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
    height: 100% !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-left"]:not(:has(header)) {
    display: none !important;
    pointer-events: none !important;
  }

  /* Middle Drawer (Call Info, Camera Capture, Attachment Preview) */
  html[data-walinux-portrait="true"] [data-testid="drawer-middle"] {
    pointer-events: auto !important;
    position: absolute !important;
    left: 64px !important;
    margin-left: 0 !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 350 !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }
  html[data-walinux-portrait="true"] [data-testid="drawer-middle"]:not(:has(header)):not(:has(button)) {
    display: none !important;
    pointer-events: none !important;
  }

  /* c3: Chats List Pane (#pane-side container) */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > div:nth-child(4) {
    position: absolute !important;
    left: 64px !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 200 !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }

  /* c4: Active Conversation Pane (#main container) */
  html[data-walinux-portrait="true"] [data-testid="wa-web-main-screen"] > div > div:nth-child(5) {
    position: absolute !important;
    left: 64px !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 250 !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }

  /* c6: Right Drawer (Contact/Group/Channel Info) */
  html[data-walinux-portrait="true"] [data-testid="drawer-right"] {
    position: absolute !important;
    left: 64px !important;
    top: 0 !important;
    width: calc(100% - 64px) !important;
    height: 100% !important;
    z-index: 400 !important;
    animation: none !important;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
    will-change: transform;
  }

  /* ---------------- STATE 1: LIST VIEW ---------------- */
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="wa-web-main-screen"] > div > div:nth-child(4),
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="drawer-left"] {
    transform: translate3d(0, 0, 0) !important;
    visibility: visible !important;
    pointer-events: auto !important;
  }
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="wa-web-main-screen"] > div > div:nth-child(5),
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="drawer-middle"],
  html[data-walinux-portrait="true"][data-portrait-view="list"] [data-testid="drawer-right"] {
    transform: translate3d(100%, 0, 0) !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  /* ---------------- STATE 2: CHAT VIEW ---------------- */
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="wa-web-main-screen"] > div > div:nth-child(4),
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="drawer-left"] {
    transform: translate3d(-100%, 0, 0) !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }
  html[data-walinux-portrait="true"][data-portrait-view="chat"] [data-testid="wa-web-main-screen"] > div > div:nth-child(5),
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
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="wa-web-main-screen"] > div > div:nth-child(4),
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="drawer-left"],
  html[data-walinux-portrait="true"][data-portrait-view="info"] [data-testid="wa-web-main-screen"] > div > div:nth-child(5),
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
    color: var(--icon-fixed, #aebac1);
    margin-right: 4px;
    padding: 0;
    outline: none;
    flex-shrink: 0;
    transition: background-color 0.15s ease;
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
  }
}

export function getPortraitViewState(): PortraitViewState {
  return currentViewState;
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
    } else {
      document.documentElement.removeAttribute('data-walinux-portrait');
      document.documentElement.removeAttribute('data-portrait-view');
    }
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
        <path fill="currentColor" d="m7.82 13 4.9 4.9c.2.2.3.43.3.7a1 1 0 0 1-.32.7c-.2.18-.43.28-.7.29a.92.92 0 0 1-.7-.29l-6.6-6.6a.88.88 0 0 1-.21-.32 1.1 1.1 0 0 1-.07-.38c0-.13.03-.26.07-.38a.88.88 0 0 1 .21-.32l6.6-6.6a.93.93 0 0 1 .69-.27.97.97 0 0 1 1.01.99c0 .27-.1.5-.3.7L7.82 11H19c.28 0 .52.1.71.29.2.19.29.43.29.71 0 .28-.1.52-.29.71A.94.94 0 0 1 19 13H7.82Z"></path>
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
          // Toggle between List and Chat view
          if (currentViewState === 'chat' || currentViewState === 'info') {
            setPortraitViewState('list');
          } else {
            setPortraitViewState('chat');
          }
        } else {
          // Switching tabs: always start with list view
          setPortraitViewState('list');
        }
        return;
      }

      // 2. Chat list item click (in Chats tab)
      const chatListItem = target.closest(
        '#pane-side [role="row"], #pane-side [data-testid^="list-item-"], #pane-side [role="listitem"]'
      );
      if (chatListItem) {
        setPortraitViewState('chat');
        setTimeout(injectBackButton, 50);
        return;
      }

      // 3. Drawer-left item clicks (Calls, Channels, Communities)
      const drawerLeftItem = target.closest(
        '[data-testid="drawer-left"] [role="row"], [data-testid="drawer-left"] [data-testid^="list-item-"], [data-testid="drawer-left"] [role="listitem"]'
      );
      if (drawerLeftItem) {
        const activeTab = getActiveTabLabel();
        if (activeTab.includes('call')) {
          // Clicking a call history item opens Call Info in drawer-middle
          setPortraitViewState('chat');
        } else if (activeTab.includes('channel')) {
          // Clicking a channel opens chat in #main
          setPortraitViewState('chat');
          setTimeout(injectBackButton, 50);
        } else if (activeTab.includes('communit')) {
          // Check if this click is a nested sub-chat or a community header
          // Sub-chat rows have secondary/timestamp details, community headers don't have message timestamps
          const isAnnouncementOrGroup = (
            drawerLeftItem.querySelector('[data-testid="cell-frame-primary-detail"]') ||
            drawerLeftItem.querySelector('[data-testid="last-msg-status"]') ||
            ((drawerLeftItem as HTMLElement).innerText || drawerLeftItem.textContent || '').includes('\n')
          );
          // Wait briefly to see if #main opens a conversation
          setTimeout(() => {
            const hasActiveChat = Boolean(document.querySelector('#main header'));
            if (hasActiveChat && isAnnouncementOrGroup) {
              setPortraitViewState('chat');
              injectBackButton();
            }
          }, 100);
        }
        return;
      }

      // 4. Click on chat header title/avatar to open Right Drawer (Contact Info)
      const chatHeaderTitle = target.closest('#main header > div:first-child [role="button"]');
      if (chatHeaderTitle && !chatHeaderTitle.classList.contains(BACK_BTN_CLASS)) {
        setTimeout(() => {
          const drawerRight = document.querySelector('[data-testid="drawer-right"]');
          if (drawerRight && drawerRight.children.length > 0) {
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
        setPortraitViewState('chat');
        return;
      }

      // 6. Click on Middle Drawer Close Button (Call Info, Camera, Media Preview)
      const drawerMiddleClose = target.closest(
        '[data-testid="drawer-middle"] button[aria-label="Close"], [data-testid="drawer-middle"] [aria-label="Close"]'
      );
      if (drawerMiddleClose) {
        const activeTab = getActiveTabLabel();
        if (activeTab.includes('call')) {
          setPortraitViewState('list');
        } else {
          setPortraitViewState('chat');
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
