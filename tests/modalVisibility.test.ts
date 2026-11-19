import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

function checkIsAnyModalOpen(state: {
  activeModals?: Set<string>;
  disclaimerOpen?: boolean;
  protocolPromptOpen?: boolean;
  addAccountPromptOpen?: boolean;
}): boolean {
  return Boolean(
    (state.activeModals && state.activeModals.size > 0) ||
    state.disclaimerOpen ||
    state.protocolPromptOpen ||
    state.addAccountPromptOpen
  );
}

describe('Modal Visibility & WhatsApp View Management', () => {
  test('isAnyModalOpen returns false when no modals are open', () => {
    const state = {
      activeModals: new Set<string>(),
      disclaimerOpen: false,
      protocolPromptOpen: false,
      addAccountPromptOpen: false,
    };
    assert.equal(checkIsAnyModalOpen(state), false);
  });

  test('isAnyModalOpen returns true when activeModals contains an open modal id', () => {
    const state = {
      activeModals: new Set<string>(),
      disclaimerOpen: false,
      protocolPromptOpen: false,
      addAccountPromptOpen: false,
    };
    state.activeModals.add('add-account');
    assert.equal(checkIsAnyModalOpen(state), true);

    state.activeModals.delete('add-account');
    assert.equal(checkIsAnyModalOpen(state), false);
  });

  test('isAnyModalOpen handles multiple concurrent modals (stack/nested modals)', () => {
    const state = {
      activeModals: new Set<string>(),
      disclaimerOpen: false,
      protocolPromptOpen: false,
      addAccountPromptOpen: false,
    };
    state.activeModals.add('protocol-prompt');
    assert.equal(checkIsAnyModalOpen(state), true);

    state.activeModals.add('avatar-zoom');
    assert.equal(checkIsAnyModalOpen(state), true);

    // Closing the top-most modal keeps isAnyModalOpen true
    state.activeModals.delete('avatar-zoom');
    assert.equal(checkIsAnyModalOpen(state), true);

    // Closing the last modal returns to false
    state.activeModals.delete('protocol-prompt');
    assert.equal(checkIsAnyModalOpen(state), false);
  });

  test('isAnyModalOpen maintains backwards compatibility with legacy flags', () => {
    const state = {
      activeModals: new Set<string>(),
      disclaimerOpen: false,
      protocolPromptOpen: false,
      addAccountPromptOpen: false,
    };

    state.disclaimerOpen = true;
    assert.equal(checkIsAnyModalOpen(state), true);
    state.disclaimerOpen = false;

    state.protocolPromptOpen = true;
    assert.equal(checkIsAnyModalOpen(state), true);
    state.protocolPromptOpen = false;

    state.addAccountPromptOpen = true;
    assert.equal(checkIsAnyModalOpen(state), true);
    state.addAccountPromptOpen = false;

    assert.equal(checkIsAnyModalOpen(state), false);
  });
});
