import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Account Lifecycle & Switching Order', () => {
  test('history stack tracks switching and falls back to previous active account', () => {
    let accountHistory: string[] = ['acc_official'];
    let activeAccountId = 'acc_official';

    const switchActive = (newId: string) => {
      accountHistory = accountHistory.filter((id) => id !== newId);
      accountHistory.push(newId);
      activeAccountId = newId;
    };

    const unloadAccount = (id: string, allAccounts: { id: string }[]) => {
      accountHistory = accountHistory.filter((accId) => accId !== id);
      if (activeAccountId === id) {
        let targetId = '';
        for (let i = accountHistory.length - 1; i >= 0; i--) {
          const candidate = accountHistory[i];
          if (candidate !== id && allAccounts.some((a) => a.id === candidate)) {
            targetId = candidate;
            break;
          }
        }
        if (!targetId && allAccounts.length > 0) {
          targetId = allAccounts.find((a) => a.id !== id)?.id || allAccounts[0].id;
        }
        activeAccountId = targetId;
      }
    };

    const accounts = [
      { id: 'acc_official' },
      { id: 'acc_personal' },
      { id: 'acc_work' },
    ];

    // User switches to personal
    switchActive('acc_personal');
    assert.equal(activeAccountId, 'acc_personal');
    assert.deepEqual(accountHistory, ['acc_official', 'acc_personal']);

    // User unloads personal: should switch back to official
    unloadAccount('acc_personal', accounts);
    assert.equal(activeAccountId, 'acc_official');
    assert.deepEqual(accountHistory, ['acc_official']);

    // User switches to personal again, then to work
    switchActive('acc_personal');
    switchActive('acc_work');
    assert.equal(activeAccountId, 'acc_work');
    assert.deepEqual(accountHistory, ['acc_official', 'acc_personal', 'acc_work']);

    // User unloads work: should switch back to personal
    unloadAccount('acc_work', accounts);
    assert.equal(activeAccountId, 'acc_personal');
    assert.deepEqual(accountHistory, ['acc_official', 'acc_personal']);
  });

  test('isAccountLoaded safely handles missing or destroyed webContents without throwing', () => {
    const isLoaded = (view?: { webContents?: { isDestroyed: () => boolean } | null }) => {
      return Boolean(view && view.webContents && !view.webContents.isDestroyed());
    };

    assert.equal(isLoaded(undefined), false);
    assert.equal(isLoaded({} as any), false);
    assert.equal(isLoaded({ webContents: undefined }), false);
    assert.equal(isLoaded({ webContents: null }), false);
    assert.equal(isLoaded({ webContents: { isDestroyed: () => true } }), false);
    assert.equal(isLoaded({ webContents: { isDestroyed: () => false } }), true);
  });
});
