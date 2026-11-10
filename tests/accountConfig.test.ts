import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createNewAccount } from '../src/main/accountUtils.ts';

describe('Account Configuration & Generation', () => {
  test('createNewAccount creates an account with dynamic id and standard structure', () => {
    const acc = createNewAccount(undefined, 1);

    assert.ok(acc.id.startsWith('acc_'), 'Account ID must start with acc_');
    assert.notEqual(acc.id, 'acc_default', 'Account ID must not be the deprecated acc_default');
    assert.equal(acc.name, 'Account 1');
    assert.notEqual(acc.name, 'Primary Account', 'Default name must not be Primary Account');
    assert.equal(acc.partition, `persist:account_${acc.id}`);
    assert.equal(acc.loggedIn, false);
    assert.deepEqual(acc.extensions, []);
    assert.ok(acc.settings, 'Account settings must be present');
    assert.equal(acc.settings.notificationsEnabled, true);
  });

  test('createNewAccount respects custom names and indexes', () => {
    const acc = createNewAccount('Work Profile', 3);

    assert.ok(acc.id.startsWith('acc_'));
    assert.equal(acc.name, 'Work Profile');
    assert.equal(acc.partition, `persist:account_${acc.id}`);

    const acc2 = createNewAccount('', 5);
    assert.equal(acc2.name, 'Account 5');
  });

  test('createNewAccount generates unique ids across multiple invocations', async () => {
    const acc1 = createNewAccount(undefined, 1);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const acc2 = createNewAccount(undefined, 2);

    assert.notEqual(acc1.id, acc2.id);
    assert.notEqual(acc1.partition, acc2.partition);
  });

  test('createNewAccount avoids collisions with existing account IDs', () => {
    const fakeId = `acc_${Date.now()}`;
    const acc = createNewAccount(undefined, 1, [fakeId]);

    assert.notEqual(acc.id, fakeId);
  });
});
