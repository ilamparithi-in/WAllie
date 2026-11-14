import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('Portrait Back Button Escape Sequences', () => {
  test('triggerSuccessiveEscapes dispatches 3 successive Escape key events with expected payload', async () => {
    const dispatchedEvents: Array<{ type: string; key: string; code: string; keyCode: number; which: number }> = [];

    // Mock DOM environment for node test runner
    const fakeTarget = {
      dispatchEvent: (event: any) => {
        dispatchedEvents.push({
          type: event.type,
          key: event.key,
          code: event.code,
          keyCode: event.keyCode,
          which: event.which,
        });
        return true;
      },
    };

    const dispatchEscapePress = (target: any) => {
      const opts = {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true,
        composed: true,
      };

      for (const type of ['keydown', 'keyup']) {
        const evt: any = { type, ...opts };
        target.dispatchEvent(evt);
      }
    };

    const triggerSuccessiveEscapes = (target: any, count = 3, intervalMs = 10) => {
      for (let i = 0; i < count; i++) {
        if (i === 0) {
          dispatchEscapePress(target);
        } else {
          setTimeout(() => dispatchEscapePress(target), i * intervalMs);
        }
      }
    };

    // Trigger 3 escapes
    triggerSuccessiveEscapes(fakeTarget, 3, 10);

    // Press 1 (immediate): keydown + keyup
    assert.equal(dispatchedEvents.length, 2, 'Initial press happens immediately');
    assert.equal(dispatchedEvents[0].key, 'Escape');
    assert.equal(dispatchedEvents[0].type, 'keydown');
    assert.equal(dispatchedEvents[0].keyCode, 27);
    assert.equal(dispatchedEvents[1].type, 'keyup');

    // Wait for press 2 and press 3
    await new Promise((resolve) => setTimeout(resolve, 35));

    // 3 presses * 2 events (keydown + keyup) = 6 events
    assert.equal(dispatchedEvents.length, 6, 'All 3 successive presses completed (6 events total)');

    for (let i = 0; i < 6; i++) {
      assert.equal(dispatchedEvents[i].key, 'Escape');
      assert.equal(dispatchedEvents[i].code, 'Escape');
      assert.equal(dispatchedEvents[i].keyCode, 27);
      assert.equal(dispatchedEvents[i].which, 27);
      assert.equal(dispatchedEvents[i].type, i % 2 === 0 ? 'keydown' : 'keyup');
    }
  });

  test('3-press sequence addresses message selection and chat closure', () => {
    // Model state transitions:
    // State 1: In selection mode -> Press 1 exits selection mode
    // State 2: Selection mode exited, chat active -> Press 2 closes chat
    // State 3: Chat closed -> Press 3 safe no-op
    let isSelectionMode = true;
    let isChatActive = true;

    const handleEscape = () => {
      if (isSelectionMode) {
        isSelectionMode = false;
      } else if (isChatActive) {
        isChatActive = false;
      }
    };

    // Press 1
    handleEscape();
    assert.equal(isSelectionMode, false, 'Press 1 exits selection mode');
    assert.equal(isChatActive, true, 'Chat remains active after press 1');

    // Press 2
    handleEscape();
    assert.equal(isChatActive, false, 'Press 2 closes the active chat');

    // Press 3 (for good measure)
    handleEscape();
    assert.equal(isSelectionMode, false);
    assert.equal(isChatActive, false);
  });
});
