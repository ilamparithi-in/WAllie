const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const reloadIcon = document.getElementById('reload-icon');
const btnCert = document.getElementById('btn-cert');
const lockIcon = document.getElementById('lock-icon');
const urlInput = document.getElementById('url-input');
const btnCopy = document.getElementById('btn-copy');
const copiedPill = document.getElementById('copied-pill');
const btnMenu = document.getElementById('btn-menu');

const ROTATE_CW_SVG = '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>';
const LOADER_SVG = '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>';

let isCurrentlyLoading = false;
let reloadTimeout = null;

function setLoadingState(loading) {
  isCurrentlyLoading = loading;
  if (!btnReload || !reloadIcon) return;
  if (loading) {
    btnReload.title = 'Loading...';
    reloadIcon.classList.add('spinning');
    reloadIcon.innerHTML = LOADER_SVG;
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      setLoadingState(false);
    }, 4000);
  } else {
    btnReload.title = 'Refresh (Ctrl+R / F5)';
    reloadIcon.classList.remove('spinning');
    reloadIcon.innerHTML = ROTATE_CW_SVG;
    if (reloadTimeout) {
      clearTimeout(reloadTimeout);
      reloadTimeout = null;
    }
  }
}

function sendAction(action, data) {
  if (window.sandboxAPI?.sendAction) {
    window.sandboxAPI.sendAction(action, data);
  } else if (window.electronAPI?.sendSandboxAction) {
    window.electronAPI.sendSandboxAction(action, data);
  } else {
    console.warn('[Sandbox Toolbar] Neither sandboxAPI nor electronAPI available');
  }
}

function updateSecurityIcon(isSecure) {
  if (!btnCert || !lockIcon) return;
  if (isSecure) {
    btnCert.classList.remove('insecure');
    btnCert.title = 'Secure Connection (SSL/TLS Verified) — Click to view certificate';
    lockIcon.innerHTML = '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>';
  } else {
    btnCert.classList.add('insecure');
    btnCert.title = 'Insecure Connection (HTTP / Unencrypted) — Click to view security status';
    lockIcon.innerHTML = '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>';
  }
}

// Immediately populate URL from query parameter if available
const urlParams = new URLSearchParams(window.location.search);
const initialUrl = urlParams.get('url') || '';
let currentUrl = initialUrl;
if (initialUrl && urlInput) {
  urlInput.value = initialUrl;
  updateSecurityIcon(initialUrl.startsWith('https://'));
}

btnBack?.addEventListener('click', () => {
  console.log('[Sandbox Toolbar] Back clicked');
  sendAction('back');
});

btnForward?.addEventListener('click', () => {
  console.log('[Sandbox Toolbar] Forward clicked');
  sendAction('forward');
});

btnReload?.addEventListener('click', () => {
  console.log('[Sandbox Toolbar] Reload clicked');
  setLoadingState(true);
  sendAction('reload');
});

btnCert?.addEventListener('click', () => {
  console.log('[Sandbox Toolbar] Cert clicked');
  sendAction('view-cert');
});

urlInput?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    let val = urlInput.value.trim();
    if (val) {
      if (!/^https?:\/\//i.test(val) && !val.startsWith('about:')) {
        val = 'https://' + val;
      }
      currentUrl = val;
      console.log('[Sandbox Toolbar] Navigating to:', val);
      setLoadingState(true);
      sendAction('navigate', val);
      urlInput.blur();
    }
  }
});

urlInput?.addEventListener('focus', () => {
  urlInput.select();
});

let copyTimeout = null;
btnCopy?.addEventListener('click', () => {
  console.log('[Sandbox Toolbar] Copy clicked');
  const textToCopy = (urlInput?.value || currentUrl || '').trim();
  sendAction('copy-url', textToCopy);
  if (textToCopy) {
    navigator.clipboard?.writeText(textToCopy).catch(() => {});
  }

  if (copiedPill) copiedPill.classList.add('show');
  if (btnCopy) {
    btnCopy.classList.add('copy-success');
    btnCopy.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
  }

  if (copyTimeout) clearTimeout(copyTimeout);
  copyTimeout = setTimeout(() => {
    if (copiedPill) copiedPill.classList.remove('show');
    if (btnCopy) {
      btnCopy.classList.remove('copy-success');
      btnCopy.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>';
    }
  }, 1500);
});

btnMenu?.addEventListener('click', () => {
  console.log('[Sandbox Toolbar] Menu clicked');
  sendAction('show-menu');
});

// Listen for updates from main process
const subscribeUpdate = window.sandboxAPI?.onUpdate || window.electronAPI?.onSandboxUpdate;
if (subscribeUpdate) {
  subscribeUpdate((state) => {
    if (!state) return;
    if (btnBack) btnBack.disabled = !state.canGoBack;
    if (btnForward) btnForward.disabled = !state.canGoForward;

    setLoadingState(!!state.isLoading);

    if (state.url) {
      currentUrl = state.url;
      if (urlInput && document.activeElement !== urlInput) {
        urlInput.value = state.url;
      }
    }

    updateSecurityIcon(state.isSecure);
  });
}

// Signal ready to main process so it immediately pushes current state
sendAction('ready');
