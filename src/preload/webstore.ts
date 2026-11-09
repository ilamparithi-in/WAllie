const { ipcRenderer } = require('electron');

export async function setupWebStoreInjection(): Promise<void> {
  try {
    const targetAccountId = await ipcRenderer.invoke('webstore:get-target-account-id');
    if (!targetAccountId) return;

    let isInstalling = false;
    let lastUrl = '';

    async function checkAndUpdateButton() {
      const url = window.location.href;
      const match = url.match(/\/detail\/(?:[^/]+\/)?([a-p]{32})/i);
      if (!match) {
        const existing = document.getElementById('wallie-cws-btn');
        if (existing) existing.remove();
        return;
      }

      const extensionId = match[1].toLowerCase();
      const isInstalled = await ipcRenderer.invoke('webstore:check-installed', targetAccountId, extensionId);

      createOrUpdateWebStoreButton(targetAccountId, extensionId, isInstalled);
    }

    function createOrUpdateWebStoreButton(accountId: string, extensionId: string, isInstalled: boolean) {
      if (!document.body) return;

      let btn = document.getElementById('wallie-cws-btn');
      if (!btn) {
        btn = document.createElement('div');
        btn.id = 'wallie-cws-btn';
        document.body.appendChild(btn);
      }

      btn.className = '';

      Object.assign(btn.style, {
        position: 'fixed',
        top: '76px',
        right: '24px',
        zIndex: '999999',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        fontSize: '13px',
        fontWeight: '700',
        padding: '10px 18px',
        borderRadius: '20px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        transition: 'all 0.2s ease-in-out',
        border: '1px solid rgba(255,255,255,0.1)',
        userSelect: 'none'
      });

      if (isInstalled) {
        btn.innerText = 'Installed ✓';
        btn.classList.add('disabled');
        Object.assign(btn.style, {
          backgroundColor: '#202c33',
          color: '#8696a0',
          cursor: 'not-allowed',
          transform: 'none'
        });
        btn.onclick = null;
      } else {
        btn.innerText = 'Install in WAllie';
        Object.assign(btn.style, {
          backgroundColor: '#00a884',
          color: '#111b21',
          cursor: 'pointer'
        });

        btn.onmouseenter = () => {
          if (!isInstalling) {
            btn!.style.backgroundColor = '#00c298';
            btn!.style.transform = 'translateY(-2px)';
          }
        };
        btn.onmouseleave = () => {
          if (!isInstalling) {
            btn!.style.backgroundColor = '#00a884';
            btn!.style.transform = 'none';
          }
        };

        btn.onclick = async () => {
          if (isInstalling) return;
          isInstalling = true;

          btn!.innerText = 'Installing...';
          Object.assign(btn!.style, {
            backgroundColor: '#202c33',
            color: '#e9edef',
            cursor: 'wait',
            transform: 'none'
          });

          try {
            const result = await ipcRenderer.invoke('extension:install-webstore', accountId, extensionId);
            isInstalling = false;
            if (result) {
              createOrUpdateWebStoreButton(accountId, extensionId, true);
            } else {
              showErrorState();
            }
          } catch {
            isInstalling = false;
            showErrorState();
          }
        };
      }

      function showErrorState() {
        btn!.innerText = 'Failed. Try Again';
        Object.assign(btn!.style, {
          backgroundColor: '#ea4335',
          color: '#ffffff',
          cursor: 'pointer'
        });
      }
    }

    function init() {
      lastUrl = window.location.href;
      checkAndUpdateButton();

      // Listen for popstate SPA events
      window.addEventListener('popstate', checkAndUpdateButton);

      // Interval fallback for URL changes
      setInterval(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          checkAndUpdateButton();
        }
      }, 1000);
    }

    if (document.body) {
      init();
    } else {
      window.addEventListener('DOMContentLoaded', init, { once: true });
    }
  } catch (err) {
    console.error('[wallie] Failed to setup webstore injection:', err);
  }
}

