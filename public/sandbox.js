const btnBack = document.getElementById('btn-back');
const btnForward = document.getElementById('btn-forward');
const btnReload = document.getElementById('btn-reload');
const reloadIconDefault = document.getElementById('reload-icon-default');
const reloadIconSpinning = document.getElementById('reload-icon-spinning');
const btnCert = document.getElementById('btn-cert');
const lockIconSecure = document.getElementById('lock-icon-secure');
const lockIconInsecure = document.getElementById('lock-icon-insecure');
const urlInput = document.getElementById('url-input');
const btnCopy = document.getElementById('btn-copy');
const copyIconDefault = document.getElementById('copy-icon-default');
const copyIconCheck = document.getElementById('copy-icon-check');
const copiedPill = document.getElementById('copied-pill');
const btnMenu = document.getElementById('btn-menu');

let isCurrentlyLoading = false;
let reloadTimeout = null;

function setLoadingState(loading) {
  isCurrentlyLoading = loading;
  if (!btnReload || !reloadIconDefault || !reloadIconSpinning) return;
  if (loading) {
    btnReload.title = 'Loading...';
    reloadIconDefault.classList.add('hidden');
    reloadIconSpinning.classList.remove('hidden');
    if (reloadTimeout) clearTimeout(reloadTimeout);
    reloadTimeout = setTimeout(() => {
      setLoadingState(false);
    }, 4000);
  } else {
    btnReload.title = 'Refresh (Ctrl+R / F5)';
    reloadIconDefault.classList.remove('hidden');
    reloadIconSpinning.classList.add('hidden');
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
  if (!btnCert || !lockIconSecure || !lockIconInsecure) return;
  if (isSecure) {
    btnCert.classList.remove('insecure');
    btnCert.title = 'Secure Connection (SSL/TLS Verified) — Click to view certificate';
    lockIconSecure.classList.remove('hidden');
    lockIconInsecure.classList.add('hidden');
  } else {
    btnCert.classList.add('insecure');
    btnCert.title = 'Insecure Connection (HTTP / Unencrypted) — Click to view security status';
    lockIconSecure.classList.add('hidden');
    lockIconInsecure.classList.remove('hidden');
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
    copyIconDefault?.classList.add('hidden');
    copyIconCheck?.classList.remove('hidden');
  }

  if (copyTimeout) clearTimeout(copyTimeout);
  copyTimeout = setTimeout(() => {
    if (copiedPill) copiedPill.classList.remove('show');
    if (btnCopy) {
      btnCopy.classList.remove('copy-success');
      copyIconDefault?.classList.remove('hidden');
      copyIconCheck?.classList.add('hidden');
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
