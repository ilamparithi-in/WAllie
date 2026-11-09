const { ipcRenderer } = require('electron');
import { injectUnifiedTitlebar } from './titlebar';

let callStatusReported: 'answered' | 'declined' | null = null;

export function setupCallDetection(): void {
  function reportCallStatus(status: 'answered' | 'declined', sync = false) {
    if (callStatusReported === status) return;
    callStatusReported = status;
    if (sync) {
      try {
        ipcRenderer.sendSync('call:status-sync', { status });
        return;
      } catch (err) { }
    }
    ipcRenderer.send('call:status-changed', { status });
  }

  function checkCallElement(target: HTMLElement | null): 'answered' | 'declined' | null {
    if (!target) return null;
    const btn = target.closest('button, [role="button"], [data-testid], div[tabindex]');
    if (!btn) return null;

    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
    const testId = (btn.getAttribute('data-testid') || '').toLowerCase();
    const title = (btn.getAttribute('title') || '').toLowerCase();
    const text = (btn.textContent || '').trim().toLowerCase();
    const iconEl = btn.querySelector('[data-icon]');
    const icon = (iconEl?.getAttribute('data-icon') || '').toLowerCase();

    const acceptKeywords = [
      'accept', 'answer', 'pick up', 'take call', 'join call', 'annehmen', 'accepter',
      'aceptar', 'rispondi', 'atender', 'beantwoorden', 'svara', 'besvar'
    ];
    const isAccept = acceptKeywords.some(kw => ariaLabel.includes(kw) || testId.includes(kw) || title.includes(kw) || text === kw || icon.includes(kw)) ||
      testId.includes('call-accept') || testId.includes('call-answer') || icon.includes('call-accept') || icon.includes('call-answer') || icon.includes('phone-call');

    if (isAccept) return 'answered';

    const declineKeywords = [
      'decline', 'reject', 'dismiss', 'ignore', 'ablehnen', 'refuser',
      'rechazar', 'rifiuta', 'recusar', 'weigeren', 'avvisa', 'afvis'
    ];
    const isDecline = declineKeywords.some(kw => ariaLabel.includes(kw) || testId.includes(kw) || title.includes(kw) || text === kw || icon.includes(kw)) ||
      testId.includes('call-decline') || testId.includes('call-reject') || icon.includes('call-decline') || icon.includes('call-reject') || icon.includes('call-end');

    if (isDecline) return 'declined';

    try {
      const style = window.getComputedStyle(btn);
      const bg = style.backgroundColor;
      const isRound = style.borderRadius.includes('%') || parseInt(style.borderRadius, 10) > 15;
      if (isRound && bg) {
        const match = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (match) {
          const r = parseInt(match[1], 10);
          const g = parseInt(match[2], 10);
          const b = parseInt(match[3], 10);
          if (g > 150 && r < 100) {
            return 'answered';
          } else if (r > 180 && g < 100 && b < 120) {
            return 'declined';
          }
        }
      }
    } catch (e) { }

    return null;
  }

  document.addEventListener('click', (e) => {
    const status = checkCallElement(e.target as HTMLElement | null);
    if (status) {
      reportCallStatus(status, true);
    }
  }, true);

  const checkActiveCall = () => {
    const hasActiveControls = !!document.querySelector(
      '[data-testid*="hangup"], [data-testid*="end-call"], [data-icon*="end-call"], button[aria-label*="end call" i], button[aria-label*="hang up" i]'
    );
    if (hasActiveControls) {
      reportCallStatus('answered');
    }
  };

  const callObserver = new MutationObserver(() => {
    checkActiveCall();
  });

  if (document.body) {
    callObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.body) {
        callObserver.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  if (typeof window.RTCPeerConnection !== 'undefined') {
    const OrigRTCPC = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends OrigRTCPC {
      constructor(...args: any[]) {
        super(...args);
        this.addEventListener('connectionstatechange', () => {
          if (this.connectionState === 'connected') {
            reportCallStatus('answered');
          } else if (this.connectionState === 'closed') {
            callStatusReported = null;
          }
        });
      }
    };
  }

  if (navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
      try {
        if (window.location.pathname.includes('/call') && constraints && (constraints.audio || constraints.video)) {
          reportCallStatus('answered');
        }
      } catch (e) { }
      return origGUM(constraints);
    };
  }
}

export function monitorCallBlankScreen(): void {
  let callWasActive = false;
  let blankCounter = 0;
  let initialBlankTicks = 0;

  const interval = setInterval(() => {
    if (!document.body) return;

    const hasVideo = document.querySelector('video') !== null;
    const hasAudio = document.querySelector('audio') !== null;
    const hasCanvas = document.querySelector('canvas') !== null;

    const callControls = document.querySelectorAll(
      '[data-testid*="call"], [data-testid*="hangup"], [data-testid*="micro"], [data-testid*="video"], [data-testid*="screen"]'
    );
    const hasCallControls = callControls.length > 0;

    const isCallActive = hasVideo || hasAudio || hasCanvas || hasCallControls;

    if (isCallActive) {
      callWasActive = true;
      blankCounter = 0;
      return;
    }

    if (callWasActive) {
      const bodyText = (document.body.innerText || '').toLowerCase();
      const hasSurveyKeywords = ['how was', 'rate', 'feedback', 'quality', 'survey', 'stars', 'opinion'].some(
        (keyword) => bodyText.includes(keyword)
      );

      if (!hasSurveyKeywords) {
        blankCounter++;
        if (blankCounter >= 3) {
          console.log('[wallie] Call ended and screen is blank, closing window immediately.');
          clearInterval(interval);
          window.close();
        }
      } else {
        blankCounter = 0;
      }
    } else {
      initialBlankTicks++;
      if (initialBlankTicks >= 50) {
        const bodyText = (document.body.innerText || '').trim();
        if (bodyText.length < 10 && document.querySelectorAll('button').length === 0) {
          console.log('[wallie] Call failed to load (remained blank for 10s), closing window.');
          clearInterval(interval);
          window.close();
        }
      }
    }
  }, 1000);
}

export function injectCallTitlebar(): void {
  ipcRenderer.invoke('account:get-name-for-session').then((accountName: string) => {
    injectUnifiedTitlebar({
      title: 'WhatsApp Call',
      badge: accountName,
      iconType: 'call',
      controls: ['pin', 'min', 'close']
    });
    monitorCallBlankScreen();
  });
}

