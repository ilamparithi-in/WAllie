#!/usr/bin/env node
import fs from 'node:fs';

const LOCK_FILE = process.env.WALLIE_BRIDGE_LOCKFILE || '/tmp/wallie-dev-bridge.json';

function getBridgeCredentials() {
  if (!fs.existsSync(LOCK_FILE)) {
    console.error(`\x1b[31m[wa-bridge] Error: Dev Bridge lockfile not found at ${LOCK_FILE}\x1b[0m`);
    console.error(`\x1b[33mEnsure WAllie is currently running with the bridge enabled:\x1b[0m npm run dev:bridge`);
    process.exit(1);
  }

  try {
    const data = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
    return data;
  } catch (err) {
    console.error(`\x1b[31m[wa-bridge] Failed to parse lockfile at ${LOCK_FILE}:\x1b[0m`, err);
    process.exit(1);
  }
}

async function request(endpoint, options = {}) {
  const { port, token } = getBridgeCredentials();
  const url = `http://127.0.0.1:${port}${endpoint}`;

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-token': token,
        ...(options.headers || {}),
      },
    });

    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }

    if (!res.ok) {
      console.error(`\x1b[31mHTTP ${res.status} ${res.statusText}:\x1b[0m`, JSON.stringify(json, null, 2));
      process.exit(res.status);
    }

    return json;
  } catch (err) {
    console.error(`\x1b[31m[wa-bridge] Network error connecting to ${url}:\x1b[0m`, err.message);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const command = args[0] || 'help';

async function main() {
  switch (command) {
    case 'status':
    case 'health': {
      const res = await request('/status');
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'console': {
      const levelIdx = args.indexOf('--level');
      const level = levelIdx !== -1 ? args[levelIdx + 1] : undefined;
      const searchIdx = args.indexOf('--search');
      const search = searchIdx !== -1 ? args[searchIdx + 1] : undefined;
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 100;
      const clear = args.includes('--clear');

      const res = await request('/console', {
        method: 'POST',
        body: JSON.stringify({ level, search, limit, clear }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'network': {
      const typeIdx = args.indexOf('--type');
      const resourceType = typeIdx !== -1 ? args[typeIdx + 1] : undefined;
      const searchIdx = args.indexOf('--search');
      const search = searchIdx !== -1 ? args[searchIdx + 1] : undefined;
      const limitIdx = args.indexOf('--limit');
      const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 100;
      const failedOnly = args.includes('--failed');
      const clear = args.includes('--clear');

      const res = await request('/network', {
        method: 'POST',
        body: JSON.stringify({ resourceType, search, limit, failedOnly, clear }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'cdp': {
      const method = args[1];
      if (!method) {
        console.error('Usage: node scripts/wa-bridge.mjs cdp <Method.name> [\'{"param": "val"}\']');
        process.exit(1);
      }
      let params = {};
      if (args[2]) {
        try {
          params = JSON.parse(args[2]);
        } catch {
          console.error('Error: CDP params must be valid JSON');
          process.exit(1);
        }
      }

      const res = await request('/cdp', {
        method: 'POST',
        body: JSON.stringify({ method, params }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'query': {
      const selector = args[1];
      if (!selector) {
        console.error('Usage: node scripts/wa-bridge.mjs query <css-selector> [--limit N] [--html]');
        process.exit(1);
      }
      const limitArgIdx = args.indexOf('--limit');
      const limit = limitArgIdx !== -1 ? Number(args[limitArgIdx + 1]) : 50;
      const includeHtml = args.includes('--html');

      const res = await request('/query', {
        method: 'POST',
        body: JSON.stringify({ selector, limit, includeHtml }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'eval': {
      const code = args.slice(1).join(' ');
      if (!code) {
        console.error('Usage: node scripts/wa-bridge.mjs eval <code>');
        process.exit(1);
      }
      const res = await request('/eval', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'dom': {
      const selector = args[1] && !args[1].startsWith('--') ? args[1] : 'html';
      const maxCharsIdx = args.indexOf('--chars');
      const maxChars = maxCharsIdx !== -1 ? Number(args[maxCharsIdx + 1]) : 500000;

      const res = await request('/dom', {
        method: 'POST',
        body: JSON.stringify({ selector, maxChars, stripBlobs: true }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'screenshot': {
      const savePath = args[1];
      const res = await request('/screenshot', {
        method: 'POST',
        body: JSON.stringify({ savePath }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'record': {
      const durationIdx = args.indexOf('--duration');
      const durationMs = durationIdx !== -1 ? Number(args[durationIdx + 1]) : 5000;
      const filterIdx = args.indexOf('--filter');
      const filter = filterIdx !== -1 ? args[filterIdx + 1] : '';

      console.log(`\x1b[36m[wa-bridge] Recording DOM mutations and drag events for ${durationMs}ms...\x1b[0m`);

      // Script that runs in target webContents
      const clientScript = `
        new Promise((resolve) => {
          const mutations = [];
          const events = [];
          const startTime = performance.now();

          const observer = new MutationObserver((records) => {
            const now = Math.round(performance.now() - startTime);
            for (const r of records) {
              const el = r.target;
              const testId = el.getAttribute ? el.getAttribute('data-testid') : null;
              const tagDesc = el.nodeName + (el.id ? '#' + el.id : '') + (testId ? '[' + testId + ']' : '');
              const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : '';
              const desc = tagDesc + (cls ? '.' + cls : '');

              if (${JSON.stringify(filter)} && !desc.toLowerCase().includes(${JSON.stringify(filter)})) {
                continue;
              }

              mutations.push({
                timeMs: now,
                type: r.type,
                target: desc,
                attribute: r.attributeName || undefined,
                addedCount: r.addedNodes.length || undefined,
                removedCount: r.removedNodes.length || undefined,
                added: Array.from(r.addedNodes).slice(0, 3).map(n => n.nodeName + (n.getAttribute?.('data-testid') ? '[' + n.getAttribute('data-testid') + ']' : '')),
                removed: Array.from(r.removedNodes).slice(0, 3).map(n => n.nodeName + (n.getAttribute?.('data-testid') ? '[' + n.getAttribute('data-testid') + ']' : ''))
              });
              if (mutations.length > 1000) mutations.shift();
            }
          });

          observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeOldValue: true
          });

          const eventNames = ['dragenter', 'dragleave', 'dragover', 'drop'];
          const eventLogger = (e) => {
            const now = Math.round(performance.now() - startTime);
            const t = e.target;
            const testId = t && t.getAttribute ? t.getAttribute('data-testid') : null;
            const desc = t ? (t.nodeName + (t.id ? '#' + t.id : '') + (testId ? '[' + testId + ']' : '')) : null;
            events.push({
              timeMs: now,
              type: e.type,
              target: desc
            });
            if (events.length > 500) events.shift();
          };

          eventNames.forEach(name => window.addEventListener(name, eventLogger, true));

          setTimeout(() => {
            observer.disconnect();
            eventNames.forEach(name => window.removeEventListener(name, eventLogger, true));

            const targetCounts = {};
            for (const m of mutations) {
              targetCounts[m.target] = (targetCounts[m.target] || 0) + 1;
            }
            const flickering = Object.entries(targetCounts)
              .sort((a, b) => b[1] - a[1])
              .filter(([_, count]) => count >= 2)
              .map(([target, count]) => ({ target, count }));

            resolve({
              durationMs: ${durationMs},
              totalMutations: mutations.length,
              totalEvents: events.length,
              flickering,
              eventsSummary: events.reduce((acc, ev) => { acc[ev.type] = (acc[ev.type] || 0) + 1; return acc; }, {}),
              recentMutations: mutations.slice(-50),
              recentEvents: events.slice(-50)
            });
          }, ${durationMs});
        })
      `;

      const res = await request('/eval', {
        method: 'POST',
        body: JSON.stringify({ code: clientScript }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    case 'switch': {
      const accountId = args[1];
      if (!accountId) {
        console.error('Usage: node scripts/wa-bridge.mjs switch <accountId>');
        process.exit(1);
      }
      const res = await request('/accounts/switch', {
        method: 'POST',
        body: JSON.stringify({ accountId }),
      });
      console.log(JSON.stringify(res, null, 2));
      break;
    }

    default:
      console.log(`
\x1b[1;33mWAllie Dev Bridge CLI Helper\x1b[0m

Usage:
  node scripts/wa-bridge.mjs status
  node scripts/wa-bridge.mjs console [--level error|warning|info] [--search text] [--limit N] [--clear]
  node scripts/wa-bridge.mjs network [--type xhr|fetch|websocket] [--failed] [--search text] [--limit N] [--clear]
  node scripts/wa-bridge.mjs cdp <Method.name> ['{"param": "val"}']
  node scripts/wa-bridge.mjs query '<selector>' [--limit N] [--html]
  node scripts/wa-bridge.mjs eval '<code>'
  node scripts/wa-bridge.mjs dom ['<selector>'] [--chars N]
  node scripts/wa-bridge.mjs screenshot [savePath]
  node scripts/wa-bridge.mjs record [--duration ms] [--filter keyword]
  node scripts/wa-bridge.mjs switch <accountId>
`);
      break;
  }
}

main();
